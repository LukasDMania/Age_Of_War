import { buildingEffects } from '@systems/BuildingSystem';
import { getAge, type SpecialConfig } from '@config/ages.config';
import { getProjectileFlight } from '@config/projectiles.config';
import { GAME_WIDTH, LANE_Y, SPAWN_X } from '@config/constants';
import type { ProjectileFactory } from '@entities/ProjectileFactory';
import { UnitState, type Unit } from '@entities/Unit';
import type { UnitFactory } from '@entities/UnitFactory';
import type { MatchState } from '@state/GameState';
import { laneDir, otherSide, SIDES, type Side } from '@state/types';
import { emit, Events, on } from '@utils/EventBus';
import { Rng } from '@utils/Rng';

/** Why a special request was turned down. */
export type SpecialRejection = 'not-playing' | 'cooling-down';

/** A strike waiting to be launched. */
interface PendingStrike {
  side: Side;
  atMs: number;
  special: SpecialConfig;
}

/** Strikes appear this far above the top of the screen. */
const STRIKE_START_Y = -40;
/** Strikes come in at an angle: they start this far behind the target (from the caster's side). */
const STRIKE_DRIFT_X = 140;
/** Strikes are aimed at the lane line (they stop at the first enemy on the way). */
const STRIKE_LAND_Y = LANE_Y;

/**
 * The special attack: a cooldown ability per side, no gold cost. Using it
 * starts the age's shower (see `SpecialConfig`): its strikes are launched one
 * by one over `durationMs`, each falling in a straight line toward a random
 * living enemy unit (leading it if it is walking). A strike bursts on the
 * first enemy it meets, or on the ground, through the normal projectile
 * pipeline; it never hits a base. With no enemy units on the lane a strike lands on a
 * random spot of the enemy's half.
 *
 * The cooldown lives in `SideState.specialReadyAt` (simulation time), so it
 * freezes while paused. The special fired is the one of the side's age at
 * the moment of firing.
 *
 * Listens for: `special-requested`.
 * Emits: `special-fired`, `special-cooldown-changed` (when fired, every frame
 * while cooling down, and once more on reaching 0); damage events through
 * `ProjectileSystem`.
 */
export class SpecialSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly projectiles: ProjectileFactory;
  private readonly clock: () => number;
  private readonly pending: PendingStrike[] = [];
  /** Last cooldown value reported per side, to send the final 0 once. */
  private readonly lastRemaining: Record<Side, number> = { player: 0, enemy: 0 };
  private readonly candidates: Unit[] = [];
  private readonly unsubscribe: () => void;

  /** `clock` returns the simulation time (`MatchSystem.elapsedMs`). */
  /** Seeded: targets and landing spots must match in both lockstep browsers. */
  private readonly rng: Rng;

  constructor(state: MatchState, units: UnitFactory, projectiles: ProjectileFactory, clock: () => number) {
    this.state = state;
    this.units = units;
    this.projectiles = projectiles;
    this.clock = clock;
    this.rng = Rng.derive(state.seed, 'special');
    this.unsubscribe = on(Events.SpecialRequested, ({ side }) => this.onRequested(side));
  }

  /** Remaining cooldown for a side, in ms (0 = ready). */
  remainingMs(side: Side): number {
    return Math.max(0, this.state[side].specialReadyAt - this.clock());
  }

  rejectionFor(side: Side): SpecialRejection | null {
    if (this.state.phase !== 'playing') return 'not-playing';
    if (this.remainingMs(side) > 0) return 'cooling-down';
    return null;
  }

  /** `nowMs` is the simulation clock. */
  update(nowMs: number): void {
    // Launch every strike that is due (the list is short: one shower or two).
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const strike = this.pending[i];
      if (!strike || strike.atMs > nowMs) continue;
      this.pending.splice(i, 1);
      this.launchStrike(strike.side, strike.special);
    }
    for (const side of SIDES) {
      const remaining = this.remainingMs(side);
      if (remaining > 0 || this.lastRemaining[side] > 0) this.emitCooldown(side, remaining);
    }
  }

  destroy(): void {
    this.unsubscribe();
    this.pending.length = 0;
  }

  private onRequested(side: Side): void {
    if (this.rejectionFor(side) !== null) return;
    const sideState = this.state[side];
    const special = getAge(sideState.age).special;
    const now = this.clock();
    // Shrine levels and perks: faster recharge, stronger strikes (2026-09-26).
    const fx = buildingEffects(sideState);
    const cooldownMs = special.cooldownMs * fx.specialCooldown;
    sideState.specialReadyAt = now + cooldownMs;
    const gap = special.strikes > 1 ? special.durationMs / (special.strikes - 1) : 0;
    for (let i = 0; i < special.strikes; i++) {
      this.pending.push({ side, atMs: now + i * gap, special });
    }
    emit(Events.SpecialFired, { side, age: sideState.age });
    this.emitCooldown(side, cooldownMs);
  }

  private launchStrike(side: Side, special: SpecialConfig): void {
    const flight = getProjectileFlight(special.projectileKey);
    const dir = laneDir(side);
    const target = this.randomEnemy(side);
    let landX: number;
    if (target) {
      // Lead a walking target by roughly the fall time.
      const fallMs = (Math.hypot(STRIKE_DRIFT_X, STRIKE_LAND_Y - STRIKE_START_Y) / flight.speed) * 1000;
      const lead =
        target.unitState === UnitState.Walking ? (laneDir(target.side) * target.getStat('speed') * fallMs) / 1000 : 0;
      landX = target.x + lead + this.between(-special.radius / 2, special.radius / 2);
    } else {
      // Nobody to hit: somewhere on the enemy's half of the lane.
      const middle = GAME_WIDTH / 2;
      const enemySpawn = SPAWN_X[otherSide(side)];
      landX = this.between(Math.min(middle, enemySpawn), Math.max(middle, enemySpawn));
    }
    const startX = landX - dir * STRIKE_DRIFT_X;
    this.projectiles
      .launch(special.projectileKey, side, startX, STRIKE_START_Y, special.damage * buildingEffects(this.state[side]).specialDamage, special.radius)
      .aimAt(landX, STRIKE_LAND_Y);
  }

  /** A seeded float in [min, max). */
  private between(min: number, max: number): number {
    return min + this.rng.next() * (max - min);
  }

  private randomEnemy(side: Side): Unit | null {
    const enemy = otherSide(side);
    this.candidates.length = 0;
    for (const unit of this.units.activeUnits) {
      if (unit.side === enemy && unit.onLane) this.candidates.push(unit);
    }
    if (this.candidates.length === 0) return null;
    return this.candidates[this.rng.int(this.candidates.length)] ?? null;
  }

  private emitCooldown(side: Side, remainingMs: number): void {
    this.lastRemaining[side] = remainingMs;
    const totalMs = getAge(this.state[side].age).special.cooldownMs * buildingEffects(this.state[side]).specialCooldown;
    emit(Events.SpecialCooldownChanged, { side, remainingMs, totalMs });
  }
}
