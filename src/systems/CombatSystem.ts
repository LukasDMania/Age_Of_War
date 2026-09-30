import type { Base } from '@entities/Base';
import type { UnitAttack } from '@entities/unitDefinitions';
import { UnitState, type Unit } from '@entities/Unit';
import type { ProjectileFactory } from '@entities/ProjectileFactory';
import type { UnitFactory } from '@entities/UnitFactory';
import type { MatchState } from '@state/GameState';
import { laneDir, otherSide, type Side } from '@state/types';
import { dealBaseDamage, dealSplashDamage, dealUnitDamage } from '@systems/damageOps';
import { knockBack, pullTo } from '@systems/laneOps';
import { shotLine } from '@systems/shotLine';
import { applyBurn } from '@systems/statusOps';

/** A spin-up weapon (minigun) winds down after this long without firing, sim ms. */
const SPIN_RESET_MS = 1200;
/** A grapple doesn't bother with an enemy already this close, px (edge to edge). */
const PULL_MIN_GAP = 24;
import { emit, Events } from '@utils/EventBus';

/**
 * Unit targeting and attacks. Each frame every armed unit looks for the
 * nearest enemy unit within its reach (edge to edge), falling back to the
 * enemy base, and attacks on its cooldown. A unit standing inside its own
 * gate is out of a melee attacker's reach at the base front, so the
 * attacker strikes the wall (owner, 2026-09-27: pushing an enemy back to
 * its door should hurt the base). Units with a target stand still
 * (`Attacking`); the rest are marked `Walking` for `LaneSystem` to move.
 *
 * Melee units (no `projectileKey`) hit at once; ranged units fire a pooled
 * projectile level along the lane, which `ProjectileSystem` flies until it
 * hits the first enemy unit (or the enemy base) in its way. `attack.splashRadius`
 * also hurts every other enemy unit that close to the hit, and the enemy
 * base when the splash reaches its body.
 *
 * A unit with a `secondaryAttack` (a Mech's other arm) also fires that at
 * whatever is in its reach, on its own cooldown, walking or not; only the
 * main attack makes it stop. `baseDamageMult` multiplies melee blows on a
 * base (the siege drill).
 *
 * Mech weapons (Mech expansion; optional fields on `UnitAttack`): flames
 * hit everything in a short cone and set it burning; lightning jumps from
 * the target to more enemies; a grapple pulls the back-most enemy in reach
 * forward; heavy blows can knock back; a minigun fires faster the longer
 * it fires; a railgun shot pierces the whole line; a Sniper scope aims gun
 * arms at the back-most enemy, over the front line. An enemy Mech with a
 * Taunt beacon near an attacker is the attacker's target when in reach.
 * Airborne (leaping) units don't fight.
 *
 * Side traits (Conquest rewards, `SideState.traits`): a unit's first attack
 * can hit harder, blows can heal the attacker, a slot's attacks can hurt
 * bases more, and every nth shot of a slot can pierce.
 *
 * Damage goes through `damageOps`; deaths are reported by `CasualtySystem`,
 * and gold/XP rewards come from `unit-died` (EconomySystem).
 *
 * Emits: `unit-struck` (feedback, each blow or shot), `unit-healed`
 * (lifesteal), `weapon-fx` (flames, lightning; laneOps: pulls, knockbacks);
 * through damageOps `unit-damaged`, `area-hit`,
 * `base-damaged`, `base-destroyed`.
 */
export class CombatSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly bases: Record<Side, Base>;
  private readonly projectiles: ProjectileFactory;
  private nowMs = 0;

  constructor(state: MatchState, units: UnitFactory, bases: Record<Side, Base>, projectiles: ProjectileFactory) {
    this.state = state;
    this.units = units;
    this.bases = bases;
    this.projectiles = projectiles;
  }

  /** `nowMs` is the simulation clock (`MatchSystem.elapsedMs`). */
  update(nowMs: number): void {
    this.nowMs = nowMs;
    for (const unit of this.units.activeUnits) {
      if (!unit.isAlive || unit.airborne) continue;
      this.fireSecondary(unit, nowMs);

      const attack = unit.attack;
      if (!attack) {
        unit.unitState = UnitState.Walking;
        continue;
      }

      // Mid-swing: stand still until the strike frame, then hit whatever is
      // in reach at that moment (the first target may already be gone).
      if (unit.strikeAt > 0) {
        unit.unitState = UnitState.Attacking;
        if (nowMs < unit.strikeAt) continue;
        unit.strikeAt = 0;
        this.resolve(unit, attack);
        continue;
      }

      const range = unit.getStat('range');
      const targetUnit = this.nearestEnemyInReach(unit, range);
      const targetBase = targetUnit ? null : this.enemyBaseInReach(unit, range);
      if (!targetUnit && !targetBase) {
        unit.unitState = UnitState.Walking;
        continue;
      }

      unit.unitState = UnitState.Attacking;
      if (nowMs < unit.attackReadyAt) continue;
      unit.attackReadyAt = nowMs + Math.max(1, this.cooldown(unit, attack, unit.getStat('attackCooldown'), nowMs));
      unit.playAttack();
      if (attack.windupMs && attack.windupMs > 0) {
        unit.strikeAt = nowMs + attack.windupMs;
        continue;
      }
      this.resolve(unit, attack, targetUnit, targetBase);
    }
  }

  /** The hit (melee) or the release (ranged) of an attack. */
  private resolve(unit: Unit, attack: UnitAttack, targetUnit?: Unit | null, targetBase?: Base | null): void {
    // First strike (trait): the unit's first attack hits harder.
    const first = unit.attacksMade === 0 ? (this.state[unit.side].traits.firstStrike[unit.definition.slot] ?? 1) : 1;
    unit.attacksMade++;
    const damage = unit.getStat('damage') * first;
    const range = unit.getStat('range');
    const target = targetUnit === undefined ? this.nearestEnemyInReach(unit, range) : targetUnit;
    const base = target ? null : targetBase === undefined ? this.enemyBaseInReach(unit, range) : targetBase;
    this.useWeapon(unit, attack, damage, range, target, base);
  }

  /** One use of a weapon, by what kind it is. */
  private useWeapon(unit: Unit, attack: UnitAttack, damage: number, reach: number, targetUnit: Unit | null, targetBase: Base | null): void {
    if (attack.pull) {
      this.grapple(unit, attack, damage, reach);
      return;
    }
    if (attack.projectileKey) {
      this.shoot(unit, attack, attack.projectileKey, damage, reach);
      return;
    }
    this.announce(unit, attack);
    if (attack.chain && targetUnit) {
      this.lightning(unit, attack, damage, targetUnit);
      return;
    }
    if (attack.cone) {
      this.flames(unit, attack, damage, reach);
      return;
    }
    this.strike(unit, attack, damage, targetUnit, targetBase);
  }

  /** The attack's cooldown now: a spin-up weapon gets faster the longer it keeps firing. */
  private cooldown(unit: Unit, attack: UnitAttack, base: number, nowMs: number): number {
    const spin = attack.spinUp;
    if (!spin) return base;
    if (unit.spinSince < 0 || nowMs - unit.spinLastShot > SPIN_RESET_MS) unit.spinSince = nowMs;
    unit.spinLastShot = nowMs;
    const k = Math.min(1, (nowMs - unit.spinSince) / Math.max(1, spin.rampMs));
    const fast = spin.fastCooldownMs * (base / Math.max(1, attack.cooldownMs));
    return base + (fast - base) * k;
  }

  /** Flames: every enemy within the reach plus the cone takes the damage and burns; the wall too. */
  private flames(unit: Unit, attack: UnitAttack, damage: number, reach: number): void {
    const dir = laneDir(unit.side);
    const far = reach + (attack.cone ?? 0);
    const x0 = unit.x + dir * unit.halfWidth;
    for (const other of this.units.activeUnits) {
      if (other.side === unit.side || !other.isAlive) continue;
      const gap = this.gapTo(unit, other);
      if (gap === null || gap > far) continue;
      dealUnitDamage(other, damage, unit.side);
      if (attack.burn) applyBurn(other, attack.burn.dps * unit.statMultiplier('damage'), this.nowMs + attack.burn.durationMs, unit.side);
    }
    const base = this.enemyBaseInReach(unit, far);
    if (base) dealBaseDamage(base, damage * (this.state[unit.side].traits.baseDamage[unit.definition.slot] ?? 1));
    emit(Events.WeaponFx, { side: unit.side, kind: 'flame', x: x0, y: unit.y - unit.bodyHeight * 0.55, points: [x0, unit.y - unit.bodyHeight * 0.55, x0 + dir * far, unit.y - 14] });
  }

  /** Lightning: the target, then up to `jumps` more enemies near the last one hit, weaker each jump. */
  private lightning(unit: Unit, attack: UnitAttack, damage: number, first: Unit): void {
    const chain = attack.chain!;
    const hit = new Set<Unit>();
    const points: number[] = [unit.x + laneDir(unit.side) * unit.halfWidth, unit.y - unit.bodyHeight * 0.6];
    let current: Unit | null = first;
    let amount = damage;
    for (let i = 0; i <= chain.jumps && current; i++) {
      hit.add(current);
      points.push(current.x, current.centerY);
      dealUnitDamage(current, amount, unit.side);
      amount *= chain.falloff;
      let next: Unit | null = null;
      let best = Infinity;
      for (const other of this.units.activeUnits) {
        if (other.side === unit.side || !other.isAlive || hit.has(other)) continue;
        const d = Math.abs(other.x - current.x) - other.halfWidth - current.halfWidth;
        if (d <= chain.reach && d < best) {
          best = d;
          next = other;
        }
      }
      current = next;
    }
    emit(Events.WeaponFx, { side: unit.side, kind: 'chain', x: points[0]!, y: points[1]!, points });
  }

  /** Grapple: hooks the back-most enemy in reach, pulls it in front of the unit and hits it. */
  private grapple(unit: Unit, attack: UnitAttack, damage: number, reach: number): void {
    const target = this.backMostEnemyInReach(unit, reach, true);
    if (!target) return;
    this.announce(unit, attack);
    pullTo(target, unit, this.bases);
    dealUnitDamage(target, damage, unit.side);
  }

  /** Melee: damage lands immediately. */
  private strike(
    unit: Unit,
    attack: UnitAttack,
    damage: number,
    targetUnit: Unit | null,
    targetBase: Base | null,
  ): void {
    const traits = this.state[unit.side].traits;
    const baseMult = traits.baseDamage[unit.definition.slot] ?? 1;
    if (targetUnit) {
      const dealt = dealUnitDamage(targetUnit, damage, unit.side);
      const steal = traits.lifesteal[unit.definition.slot];
      if (steal && dealt > 0) {
        const healed = unit.heal(dealt * steal);
        if (healed > 0) emit(Events.UnitHealed, { side: unit.side, instanceId: unit.instanceId, amount: healed, x: unit.x, topY: unit.topY });
      }
      if (attack.splashRadius) {
        const base = this.bases[otherSide(unit.side)];
        dealSplashDamage(this.units.activeUnits, targetUnit.x, attack.splashRadius, damage, unit.side, targetUnit, base, { baseMult });
      }
      if (attack.knockback && targetUnit.isAlive) knockBack(targetUnit, attack.knockback, unit.side, this.bases);
      if (attack.burn) applyBurn(targetUnit, attack.burn.dps * unit.statMultiplier('damage'), this.nowMs + attack.burn.durationMs, unit.side);
    } else if (targetBase) {
      dealBaseDamage(targetBase, damage * (attack.baseDamageMult ?? 1) * baseMult);
    }
  }

  /** The second weapon: at anything in its reach, on its own cooldown, without stopping or winding up. */
  private fireSecondary(unit: Unit, nowMs: number): void {
    const attack = unit.definition.secondaryAttack;
    if (!attack || nowMs < unit.secondaryReadyAt) return;
    const range = attack.range * unit.statMultiplier('range');
    const targetUnit = this.nearestEnemyInReach(unit, range);
    const targetBase = targetUnit ? null : this.enemyBaseInReach(unit, range);
    if (!targetUnit && !targetBase) return;
    // A grapple waits for someone worth pulling.
    if (attack.pull && !this.backMostEnemyInReach(unit, range, true)) return;
    unit.secondaryReadyAt = nowMs + Math.max(1, this.cooldown(unit, attack, attack.cooldownMs * unit.statMultiplier('attackCooldown'), nowMs));
    const damage = attack.damage * unit.statMultiplier('damage');
    this.useWeapon(unit, attack, damage, range, targetUnit, targetBase);
  }

  /** `unit-struck` for the effects: a blow, or a shot leaving `muzzle`. */
  private announce(unit: Unit, attack: UnitAttack, muzzle?: { x: number; y: number }): void {
    emit(Events.UnitStruck, {
      side: unit.side,
      instanceId: unit.instanceId,
      unitId: unit.definition.id,
      slot: unit.definition.slot,
      x: unit.x,
      frontX: unit.x + laneDir(unit.side) * unit.halfWidth,
      ranged: attack.projectileKey !== undefined,
      ...(muzzle && attack.projectileKey ? { muzzleX: muzzle.x, muzzleY: muzzle.y, projectileKey: attack.projectileKey } : {}),
    });
  }

  /**
   * Ranged: fire from the weapon's muzzle on the art toward the nearest enemy
   * in reach (`shotLine`). The target only decided that it is time to
   * shoot; the shot hits whatever enemy it meets first, or the enemy base.
   */
  private shoot(unit: Unit, attack: UnitAttack, projectileKey: string, damage: number, reach: number): void {
    const line = shotLine(this.units.activeUnits, this.bases[otherSide(unit.side)], unit, attack.muzzle, reach);
    // Sniper scope: over the front line, at the back-most enemy in reach.
    // A Taunt beacon in reach draws the shot over the units in front of it.
    const back = attack.targetBack ? this.backMostEnemyInReach(unit, reach, false) : this.taunterInReach(unit, reach);
    if (back) {
      line.x1 = back.x;
      line.y1 = back.centerY;
    }
    this.announce(unit, attack, { x: line.x0, y: line.y0 });
    const projectile = this.projectiles.launch(projectileKey, unit.side, line.x0, line.y0, damage, attack.splashRadius ?? 0);
    projectile.aimAt(line.x1, line.y1, !back);
    projectile.sourceSlot = unit.definition.slot;
    if (back) projectile.onlyUnit = back;
    if (attack.pierce) projectile.pierceLeft = 99;
    // Every nth shot pierces (trait).
    unit.shotsFired++;
    const every = this.state[unit.side].traits.pierceEvery[unit.definition.slot];
    if (every && unit.shotsFired % every === 0) projectile.pierceLeft = 1;
  }

  /** Edge-to-edge distance from `unit` to `other`, or null if `other` is behind. */
  private gapTo(unit: Unit, other: Unit): number | null {
    const ahead = (other.x - unit.x) * laneDir(unit.side);
    if (ahead < 0) return null;
    return ahead - unit.halfWidth - other.halfWidth;
  }

  private nearestEnemyInReach(unit: Unit, reach: number): Unit | null {
    const enemy = otherSide(unit.side);
    let best: Unit | null = null;
    let bestGap = Infinity;
    let taunter: Unit | null = null;
    for (const other of this.units.activeUnits) {
      if (other.side !== enemy || !other.isAlive || other.airborne) continue;
      const gap = this.gapTo(unit, other);
      if (gap === null || gap > reach) continue;
      if (gap < bestGap) {
        best = other;
        bestGap = gap;
      }
      // Taunt beacon: an enemy Mech this close must be attacked.
      const taunt = other.definition.mech?.taunt;
      if (taunt && gap <= taunt.radius) taunter = other;
    }
    return taunter ?? best;
  }

  /** An enemy Mech with a Taunt beacon within `reach` and its taunt radius, or null. */
  private taunterInReach(unit: Unit, reach: number): Unit | null {
    for (const other of this.units.activeUnits) {
      const taunt = other.definition.mech?.taunt;
      if (!taunt || other.side === unit.side || !other.isAlive || other.airborne) continue;
      const gap = this.gapTo(unit, other);
      if (gap !== null && gap <= reach && gap <= taunt.radius) return other;
    }
    return null;
  }

  /** The enemy furthest away within reach; `pullable` skips ones that can't be moved or are already close. */
  private backMostEnemyInReach(unit: Unit, reach: number, pullable: boolean): Unit | null {
    const enemy = otherSide(unit.side);
    let best: Unit | null = null;
    let bestGap = -Infinity;
    for (const other of this.units.activeUnits) {
      if (other.side !== enemy || !other.isAlive || other.airborne) continue;
      const gap = this.gapTo(unit, other);
      if (gap === null || gap > reach || gap <= bestGap) continue;
      if (pullable && (gap < PULL_MIN_GAP || other.definition.mech?.knockbackImmune)) continue;
      best = other;
      bestGap = gap;
    }
    return best;
  }

  private enemyBaseInReach(unit: Unit, reach: number): Base | null {
    const base = this.bases[otherSide(unit.side)];
    if (base.isDestroyed) return null;
    const gap = (base.frontX - unit.x) * laneDir(unit.side) - unit.halfWidth;
    return gap <= reach ? base : null;
  }
}
