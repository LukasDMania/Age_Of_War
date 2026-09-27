import type { Base } from '@entities/Base';
import type { UnitAttack } from '@entities/unitDefinitions';
import { UnitState, type Unit } from '@entities/Unit';
import type { ProjectileFactory } from '@entities/ProjectileFactory';
import type { UnitFactory } from '@entities/UnitFactory';
import type { MatchState } from '@state/GameState';
import { laneDir, otherSide, type Side } from '@state/types';
import { dealBaseDamage, dealSplashDamage, dealUnitDamage } from '@systems/damageOps';
import { shotLine } from '@systems/shotLine';
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
 * Side traits (Conquest rewards, `SideState.traits`): a unit's first attack
 * can hit harder, blows can heal the attacker, a slot's attacks can hurt
 * bases more, and every nth shot of a slot can pierce.
 *
 * Damage goes through `damageOps`; deaths are reported by `CasualtySystem`,
 * and gold/XP rewards come from `unit-died` (EconomySystem).
 *
 * Emits: `unit-struck` (feedback, each blow or shot), `unit-healed`
 * (lifesteal); through damageOps `unit-damaged`, `area-hit`,
 * `base-damaged`, `base-destroyed`.
 */
export class CombatSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly bases: Record<Side, Base>;
  private readonly projectiles: ProjectileFactory;

  constructor(state: MatchState, units: UnitFactory, bases: Record<Side, Base>, projectiles: ProjectileFactory) {
    this.state = state;
    this.units = units;
    this.bases = bases;
    this.projectiles = projectiles;
  }

  /** `nowMs` is the simulation clock (`MatchSystem.elapsedMs`). */
  update(nowMs: number): void {
    for (const unit of this.units.activeUnits) {
      if (!unit.isAlive) continue;
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
      unit.attackReadyAt = nowMs + Math.max(1, unit.getStat('attackCooldown'));
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
    emit(Events.UnitStruck, {
      side: unit.side,
      instanceId: unit.instanceId,
      unitId: unit.definition.id,
      slot: unit.definition.slot,
      x: unit.x,
      frontX: unit.x + laneDir(unit.side) * unit.halfWidth,
      ranged: attack.projectileKey !== undefined,
    });
    if (attack.projectileKey) {
      this.shoot(unit, attack, attack.projectileKey, damage);
      return;
    }
    const range = unit.getStat('range');
    const target = targetUnit === undefined ? this.nearestEnemyInReach(unit, range) : targetUnit;
    const base = target ? null : targetBase === undefined ? this.enemyBaseInReach(unit, range) : targetBase;
    this.strike(unit, attack, damage, target, base);
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
    unit.secondaryReadyAt = nowMs + Math.max(1, attack.cooldownMs * unit.statMultiplier('attackCooldown'));
    const damage = attack.damage * unit.statMultiplier('damage');
    emit(Events.UnitStruck, {
      side: unit.side,
      instanceId: unit.instanceId,
      unitId: unit.definition.id,
      slot: unit.definition.slot,
      x: unit.x,
      frontX: unit.x + laneDir(unit.side) * unit.halfWidth,
      ranged: attack.projectileKey !== undefined,
    });
    if (attack.projectileKey) this.shoot(unit, attack, attack.projectileKey, damage);
    else this.strike(unit, attack, damage, targetUnit, targetBase);
  }

  /**
   * Ranged: fire from the weapon's muzzle on the art toward the nearest enemy
   * in reach (`shotLine`). The target only decided that it is time to
   * shoot; the shot hits whatever enemy it meets first, or the enemy base.
   */
  private shoot(unit: Unit, attack: UnitAttack, projectileKey: string, damage: number): void {
    const reach = attack === unit.definition.secondaryAttack ? attack.range * unit.statMultiplier('range') : unit.getStat('range');
    const line = shotLine(this.units.activeUnits, this.bases[otherSide(unit.side)], unit, attack.muzzle, reach);
    const projectile = this.projectiles.launch(projectileKey, unit.side, line.x0, line.y0, damage, attack.splashRadius ?? 0);
    projectile.aimAt(line.x1, line.y1, true);
    projectile.sourceSlot = unit.definition.slot;
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
    for (const other of this.units.activeUnits) {
      if (other.side !== enemy || !other.isAlive) continue;
      const gap = this.gapTo(unit, other);
      if (gap !== null && gap <= reach && gap < bestGap) {
        best = other;
        bestGap = gap;
      }
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
