/**
 * The ways a unit is moved along the lane by something else (Mech weapons),
 * like `damageOps` for damage: a knockback away from the attacker and a
 * pull toward it. A Mech with Spider legs can't be moved; bases never move.
 * Positions stay between the two bases' fronts.
 *
 * Emits: `weapon-fx` (`knockback`, `pull`).
 */
import type { Base } from '@entities/Base';
import type { Unit } from '@entities/Unit';
import { laneDir, type Side } from '@state/types';
import { emit, Events } from '@utils/EventBus';

function canMove(unit: Unit): boolean {
  return unit.isAlive && !unit.airborne && !unit.definition.mech?.knockbackImmune;
}

function clampToLane(unit: Unit, x: number, bases: Record<Side, Base>): number {
  const left = bases.player.frontX + unit.halfWidth;
  const right = bases.enemy.frontX - unit.halfWidth;
  return Math.max(left, Math.min(right, x));
}

/** Pushes `unit` `px` away from `attackerSide`'s base. Returns whether it moved. */
export function knockBack(unit: Unit, px: number, attackerSide: Side, bases: Record<Side, Base>): boolean {
  if (!canMove(unit) || !(px > 0)) return false;
  const x = clampToLane(unit, unit.x + laneDir(attackerSide) * px, bases);
  if (Math.abs(x - unit.x) < 1) return false;
  emit(Events.WeaponFx, { side: attackerSide, kind: 'knockback', x: unit.x, y: unit.centerY, points: [unit.x, unit.centerY, x, unit.centerY] });
  unit.x = x;
  return true;
}

/** Pulls `unit` to just in front of `puller`. Returns whether it moved. */
export function pullTo(unit: Unit, puller: Unit, bases: Record<Side, Base>): boolean {
  if (!canMove(unit)) return false;
  const dir = laneDir(puller.side);
  const x = clampToLane(unit, puller.x + dir * (puller.halfWidth + unit.halfWidth + 2), bases);
  if ((unit.x - x) * dir <= 0) return false;
  emit(Events.WeaponFx, { side: puller.side, kind: 'pull', x: puller.x, y: puller.centerY, points: [unit.x, unit.centerY, x, unit.centerY] });
  unit.x = x;
  return true;
}
