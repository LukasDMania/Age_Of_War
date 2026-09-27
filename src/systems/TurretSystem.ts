import Phaser from 'phaser';
import { getAge } from '@config/ages.config';
import { AGE_CATCH_UP, MAX_TURRET_SLOTS } from '@config/constants';
import type { Base } from '@entities/Base';
import type { ProjectileFactory } from '@entities/ProjectileFactory';
import { Turret } from '@entities/Turret';
import {
  findTurretDefinition,
  getTurretDefinition,
  slotUnlockCost,
  turretSellRefund,
} from '@entities/turretDefinitions';
import type { Unit } from '@entities/Unit';
import type { UnitFactory } from '@entities/UnitFactory';
import { addGold, trySpendGold } from '@state/economyOps';
import type { MatchState } from '@state/GameState';
import { laneDir, otherSide, SIDES, type Side } from '@state/types';
import { ageGap } from '@systems/ageCatchUp';
import { dealSplashDamage, dealUnitDamage } from '@systems/damageOps';
import { emit, Events, on, type EventPayloads } from '@utils/EventBus';

/** Why a turret request was turned down. */
export type TurretRejection =
  | 'not-playing'
  | 'no-slot'
  | 'slot-locked'
  | 'slot-occupied'
  | 'slot-empty'
  | 'unknown-turret'
  | 'wrong-age'
  | 'max-level'
  | 'cannot-afford';

/**
 * Turrets on the bases: unlocking slots, building, upgrading, selling, and
 * shooting.
 *
 * Each side starts with `STARTING_TURRET_SLOTS` unlocked and can unlock more,
 * in order, up to `MAX_TURRET_SLOTS`, at `TURRET_SLOT_UNLOCK_COSTS`. Any
 * unlocked empty slot can take one of the current age's turrets; a built
 * turret keeps its stats through age-ups, can be upgraded up to its
 * definition's levels (Phase 11: each costs gold, raises damage and/or fire
 * rate, and is added to `TurretState.spent`) and sells for `turretSellRefund`
 * (a share of its price plus a smaller share of the upgrade spend).
 *
 * Targeting is fixed: the front-most enemy unit in range (the one that has
 * advanced furthest toward this turret's base). Shots are projectiles fired
 * straight at it when the definition has a `projectileKey` (they hit the
 * first enemy on that line, or the ground), otherwise instant (hitscan); both
 * apply `splashRadius` if set. Turrets never shoot bases.
 *
 * Listens for: `buy-slot-requested`, `buy-turret-requested`,
 * `upgrade-turret-requested`, `sell-turret-requested`.
 * Emits: `slot-unlocked`, `turret-built`, `turret-upgraded`, `turret-sold`,
 * `turret-fired` (feedback);
 * `gold-changed`
 * through economyOps; damage events through damageOps.
 */
export class TurretSystem {
  private readonly scene: Phaser.Scene;
  private readonly state: MatchState;
  private readonly bases: Record<Side, Base>;
  private readonly units: UnitFactory;
  private readonly projectiles: ProjectileFactory;
  private readonly turrets: Record<Side, (Turret | null)[]>;
  private readonly cleanups: (() => void)[];

  constructor(
    scene: Phaser.Scene,
    state: MatchState,
    bases: Record<Side, Base>,
    units: UnitFactory,
    projectiles: ProjectileFactory,
  ) {
    this.scene = scene;
    this.state = state;
    this.bases = bases;
    this.units = units;
    this.projectiles = projectiles;
    this.turrets = {
      player: Array.from({ length: MAX_TURRET_SLOTS }, () => null),
      enemy: Array.from({ length: MAX_TURRET_SLOTS }, () => null),
    };
    // Turrets already in the state (none at match start today) get sprites.
    for (const side of SIDES) {
      state[side].turrets.forEach((turretState, slotIndex) => {
        if (turretState) this.turrets[side][slotIndex] = new Turret(scene, side, slotIndex, turretState, state[side]);
      });
    }
    this.cleanups = [
      on(Events.BuySlotRequested, ({ side }) => this.onBuySlot(side)),
      on(Events.BuyTurretRequested, (payload) => this.onBuyTurret(payload)),
      on(Events.SellTurretRequested, ({ side, slotIndex }) => this.onSell(side, slotIndex)),
      on(Events.UpgradeTurretRequested, ({ side, slotIndex }) => this.onUpgrade(side, slotIndex)),
    ];
  }

  /** `nowMs` is the simulation clock. */
  update(nowMs: number): void {
    for (const side of SIDES) {
      for (const turret of this.turrets[side]) {
        if (!turret) continue;
        const target = this.frontMostEnemyInRange(turret);
        // Visual: the head follows its target (or goes back to rest).
        turret.track(target ? target.x : null, target?.centerY);
        if (!target || nowMs < turret.fireReadyAt) continue;
        turret.fireReadyAt = nowMs + Math.max(1, turret.getStat('cooldown'));
        this.fire(turret, target);
      }
    }
  }

  /** Why unlocking the next slot would fail right now, or null if it would work. */
  slotRejection(side: Side): TurretRejection | null {
    if (this.state.phase !== 'playing') return 'not-playing';
    const sideState = this.state[side];
    const cost = slotUnlockCost(sideState.unlockedSlots);
    if (sideState.unlockedSlots >= MAX_TURRET_SLOTS || cost === undefined) return 'no-slot';
    if (sideState.gold < cost) return 'cannot-afford';
    return null;
  }

  /** Why building `turretId` in `slotIndex` would fail right now, or null. */
  buildRejection(side: Side, slotIndex: number, turretId: string): TurretRejection | null {
    if (this.state.phase !== 'playing') return 'not-playing';
    const sideState = this.state[side];
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_TURRET_SLOTS) return 'no-slot';
    if (slotIndex >= sideState.unlockedSlots) return 'slot-locked';
    if (sideState.turrets[slotIndex]) return 'slot-occupied';
    const definition = findTurretDefinition(turretId);
    if (!definition) return 'unknown-turret';
    if (!getAge(sideState.age).turretIds.includes(turretId)) return 'wrong-age';
    if (sideState.gold < definition.cost) return 'cannot-afford';
    return null;
  }

  /** Why upgrading the turret in `slotIndex` would fail right now, or null. */
  upgradeRejection(side: Side, slotIndex: number): TurretRejection | null {
    if (this.state.phase !== 'playing') return 'not-playing';
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_TURRET_SLOTS) return 'no-slot';
    const turretState = this.state[side].turrets[slotIndex];
    if (!turretState) return 'slot-empty';
    const next = getTurretDefinition(turretState.turretId).upgrades[turretState.level];
    if (!next) return 'max-level';
    if (this.state[side].gold < next.cost) return 'cannot-afford';
    return null;
  }

  /** Why selling the turret in `slotIndex` would fail right now, or null. */
  sellRejection(side: Side, slotIndex: number): TurretRejection | null {
    if (this.state.phase !== 'playing') return 'not-playing';
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_TURRET_SLOTS) return 'no-slot';
    if (!this.state[side].turrets[slotIndex]) return 'slot-empty';
    return null;
  }

  /** Current stats of each slot's turret (null for empty slots). For debugging and tests. */
  statsFor(side: Side): ({ turretId: string; damage: number; cooldownMs: number; range: number } | null)[] {
    return this.turrets[side].map((turret) =>
      turret
        ? {
            turretId: turret.definition.id,
            damage: turret.getStat('damage'),
            cooldownMs: turret.getStat('cooldown'),
            range: turret.getStat('range'),
          }
        : null,
    );
  }

  destroy(): void {
    for (const off of this.cleanups) off();
    for (const side of SIDES) {
      for (const turret of this.turrets[side]) turret?.destroy();
    }
  }

  private onBuySlot(side: Side): void {
    if (this.slotRejection(side) !== null) return;
    const sideState = this.state[side];
    const slotIndex = sideState.unlockedSlots;
    const cost = slotUnlockCost(slotIndex);
    if (cost === undefined || !trySpendGold(this.state, side, cost, 'purchase')) return;
    sideState.unlockedSlots++;
    this.bases[side].showSlots(sideState.unlockedSlots);
    emit(Events.SlotUnlocked, { side, slotIndex });
  }

  private onBuyTurret({ side, slotIndex, turretId }: EventPayloads[typeof Events.BuyTurretRequested]): void {
    if (this.buildRejection(side, slotIndex, turretId) !== null) return;
    const definition = findTurretDefinition(turretId);
    if (!definition || !trySpendGold(this.state, side, definition.cost, 'purchase')) return;
    const turretState = { turretId, level: 0, spent: 0 };
    this.state[side].turrets[slotIndex] = turretState;
    this.turrets[side][slotIndex] = new Turret(this.scene, side, slotIndex, turretState, this.state[side]);
    emit(Events.TurretBuilt, { side, slotIndex, turretId });
  }

  private onUpgrade(side: Side, slotIndex: number): void {
    if (this.upgradeRejection(side, slotIndex) !== null) return;
    const turretState = this.state[side].turrets[slotIndex];
    if (!turretState) return;
    const next = getTurretDefinition(turretState.turretId).upgrades[turretState.level];
    if (!next || !trySpendGold(this.state, side, next.cost, 'purchase')) return;
    turretState.level += 1;
    turretState.spent += next.cost;
    this.turrets[side][slotIndex]?.showLevel();
    emit(Events.TurretUpgraded, { side, slotIndex, level: turretState.level });
  }

  private onSell(side: Side, slotIndex: number): void {
    if (this.sellRejection(side, slotIndex) !== null) return;
    const turretState = this.state[side].turrets[slotIndex];
    if (!turretState) return;
    const refund = turretSellRefund(turretState);
    this.state[side].turrets[slotIndex] = null;
    this.turrets[side][slotIndex]?.destroy();
    this.turrets[side][slotIndex] = null;
    addGold(this.state, side, refund, 'refund');
    emit(Events.TurretSold, { side, slotIndex, refund });
  }

  /**
   * The living enemy unit within range that is closest to this turret's own
   * base, i.e. the most dangerous one. Range is measured from the turret to
   * the near edge of the target's body.
   */
  private frontMostEnemyInRange(turret: Turret): Unit | null {
    const enemy = otherSide(turret.side);
    const range = turret.getStat('range');
    const homeX = this.bases[turret.side].x;
    const dir = laneDir(turret.side);
    let best: Unit | null = null;
    let bestAdvance = Infinity;
    for (const unit of this.units.activeUnits) {
      if (unit.side !== enemy || !unit.isAlive) continue;
      if (Math.abs(unit.x - turret.x) - unit.halfWidth > range) continue;
      // Distance from our base along the lane: smaller means further advanced.
      const advance = (unit.x - homeX) * dir;
      if (advance < bestAdvance) {
        best = unit;
        bestAdvance = advance;
      }
    }
    return best;
  }

  private fire(turret: Turret, target: Unit): void {
    const definition = turret.definition;
    // Catch-up: a side behind in age defends harder (AGE_CATCH_UP).
    const damage = turret.getStat('damage') * (1 + AGE_CATCH_UP.turretDamagePerAge * ageGap(this.state, turret.side));
    const splash = definition.splashRadius ?? 0;
    turret.playFire();
    emit(Events.TurretFired, {
      side: turret.side,
      slotIndex: turret.slotIndex,
      turretId: definition.id,
      x: turret.muzzleX,
      y: turret.muzzleY,
    });
    if (definition.projectileKey) {
      // Straight at the target's middle; it hits the first enemy on that line
      // (usually the target) or the ground.
      this.projectiles
        .launch(definition.projectileKey, turret.side, turret.muzzleX, turret.muzzleY, damage, splash)
        .aimAt(target.x, target.centerY);
      return;
    }
    dealUnitDamage(target, damage, turret.side);
    if (splash > 0) dealSplashDamage(this.units.activeUnits, target.x, splash, damage, turret.side, target);
  }
}
