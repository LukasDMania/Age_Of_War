import { LANE_Y } from '@config/constants';
import { UNIT_SHOT_HEIGHT } from '@config/projectiles.config';
import type { Base } from '@entities/Base';
import type { UnitAttack } from '@entities/unitDefinitions';
import { UnitState, type Unit } from '@entities/Unit';
import type { ProjectileFactory } from '@entities/ProjectileFactory';
import type { UnitFactory } from '@entities/UnitFactory';
import { laneDir, otherSide, type Side } from '@state/types';
import { dealBaseDamage, dealSplashDamage, dealUnitDamage } from '@systems/damageOps';

/**
 * Unit targeting and attacks. Each frame every armed unit looks for the
 * nearest enemy unit within its reach (edge to edge), falling back to the
 * enemy base, and attacks on its cooldown. Units with a target stand still
 * (`Attacking`); the rest are marked `Walking` for `LaneSystem` to move.
 *
 * Melee units (no `projectileKey`) hit at once; ranged units fire a pooled
 * projectile level along the lane, which `ProjectileSystem` flies until it
 * hits the first enemy unit (or the enemy base) in its way. `attack.splashRadius`
 * also hurts every other enemy unit that close to the hit.
 *
 * Damage goes through `damageOps`; deaths are reported by `CasualtySystem`,
 * and gold/XP rewards come from `unit-died` (EconomySystem).
 *
 * Emits (through damageOps): `unit-damaged`, `area-hit`, `base-damaged`,
 * `base-destroyed`.
 */
export class CombatSystem {
  private readonly units: UnitFactory;
  private readonly bases: Record<Side, Base>;
  private readonly projectiles: ProjectileFactory;

  constructor(units: UnitFactory, bases: Record<Side, Base>, projectiles: ProjectileFactory) {
    this.units = units;
    this.bases = bases;
    this.projectiles = projectiles;
  }

  /** `nowMs` is the simulation clock (`MatchSystem.elapsedMs`). */
  update(nowMs: number): void {
    for (const unit of this.units.activeUnits) {
      if (!unit.isAlive) continue;

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
    const damage = unit.getStat('damage');
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
    if (targetUnit) {
      dealUnitDamage(targetUnit, damage, unit.side);
      if (attack.splashRadius) {
        dealSplashDamage(this.units.activeUnits, targetUnit.x, attack.splashRadius, damage, unit.side, targetUnit);
      }
    } else if (targetBase) {
      dealBaseDamage(targetBase, damage);
    }
  }

  /**
   * Ranged: fire level along the lane from the unit's front edge. The target
   * only decided that it is time to shoot; the shot hits whatever enemy it
   * meets first, or the enemy base.
   */
  private shoot(unit: Unit, attack: UnitAttack, projectileKey: string, damage: number): void {
    const dir = laneDir(unit.side);
    const x = unit.x + dir * unit.halfWidth;
    const y = LANE_Y - UNIT_SHOT_HEIGHT;
    this.projectiles
      .launch(projectileKey, unit.side, x, y, damage, attack.splashRadius ?? 0)
      .aimAt(x + dir, y, true);
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
