/**
 * The one way damage is dealt, shared by everything that hurts (melee hits,
 * projectile impacts, turrets, the special). Like `state/economyOps.ts`,
 * these helpers mutate entities and emit the notifications, so no damage
 * source needs a reference to another system.
 *
 * A unit brought to 0 HP is only marked dead here (with its killer);
 * `CasualtySystem` emits `unit-died` and releases it at the end of the frame,
 * so no system ever sees the unit set change while iterating it.
 *
 * Emits: `unit-damaged`, `area-hit`, `base-damaged`, `base-destroyed`.
 */
import type { Base } from '@entities/Base';
import type { Unit } from '@entities/Unit';
import type { Side } from '@state/types';
import { emit, Events } from '@utils/EventBus';

/**
 * Deals damage to one unit: its shield (`Unit.shield`) soaks up what it can
 * first, the rest comes off HP. Ignores dead units and non-positive amounts.
 */
export function dealUnitDamage(unit: Unit, rawAmount: number, attackerSide: Side): void {
  if (!unit.isAlive || !(rawAmount > 0)) return;
  // Armor (Forge research, Phase 14): the unit's `damageTaken` stat, base 1.
  const amount = rawAmount * unit.getStat('damageTaken');
  const absorbed = Math.min(unit.shield, amount);
  if (absorbed > 0) {
    unit.shield -= absorbed;
    unit.markBarDirty();
  }
  const hpDamage = amount - absorbed;
  const hp = hpDamage > 0 ? unit.takeDamage(hpDamage) : unit.hp;
  emit(Events.UnitDamaged, {
    side: unit.side,
    instanceId: unit.instanceId,
    amount: hpDamage,
    absorbed,
    x: unit.x,
    topY: unit.topY,
  });
  if (hp <= 0) unit.markDead(attackerSide);
}

/**
 * Damages every living unit not on `attackerSide` whose body is within
 * `radius` px of `x` along the lane (edge distance), except `skip` (the
 * primary target, already hit directly). With `base` (the enemy base, for
 * units' attacks), the base takes the same damage when its body is that
 * close too: a heavy or siege unit fighting defenders in the gate also hits
 * the wall (owner, 2026-09-27). Emits `area-hit` once.
 */
export function dealSplashDamage(
  units: Iterable<Unit>,
  x: number,
  radius: number,
  amount: number,
  attackerSide: Side,
  skip: Unit | null = null,
  base: Base | null = null,
): void {
  if (!(radius > 0)) return;
  for (const unit of units) {
    if (unit === skip || unit.side === attackerSide || !unit.isAlive) continue;
    if (Math.abs(unit.x - x) - unit.halfWidth <= radius) {
      dealUnitDamage(unit, amount, attackerSide);
    }
  }
  if (base && base.side !== attackerSide && Math.abs(base.x - x) - base.halfWidth <= radius) {
    dealBaseDamage(base, amount);
  }
  emit(Events.AreaHit, { side: attackerSide, x, radius });
}

/** Deals damage to a base; emits `base-destroyed` the moment it falls. */
export function dealBaseDamage(base: Base, amount: number): void {
  if (base.isDestroyed || !(amount > 0)) return;
  const hp = base.takeDamage(amount);
  emit(Events.BaseDamaged, { side: base.side, hp, maxHp: base.maxHp, amount });
  if (hp <= 0) emit(Events.BaseDestroyed, { side: base.side });
}
