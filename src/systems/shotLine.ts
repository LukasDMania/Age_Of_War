import { LANE_Y } from '@config/constants';
import { UNIT_SHOT_HEIGHT } from '@config/projectiles.config';
import type { Base } from '@entities/Base';
import type { Unit } from '@entities/Unit';
import { laneDir } from '@state/types';

/** How high on a base a unit aims, px above the lane. */
const BASE_AIM_HEIGHT = 34;

export interface ShotLine {
  x0: number;
  y0: number;
  /** A point the shot flies through (and on past). */
  x1: number;
  y1: number;
}

/**
 * Where a unit's shot starts and where it heads (2026-09-28, owner: shots
 * came out too low): from the weapon's `muzzle` on the art (px from the
 * unit, x forward, y up negative) toward the middle of the nearest enemy in
 * `reach` (the one the unit is shooting at), else the enemy `base`'s wall,
 * else level ahead. Without a muzzle, from the front edge at
 * `UNIT_SHOT_HEIGHT`, as before. The shot still hits whatever it meets
 * first (`ProjectileSystem`).
 */
export function shotLine(
  units: Iterable<Unit>,
  base: Base | null,
  shooter: Unit,
  muzzle: { x: number; y: number } | undefined,
  reach: number,
): ShotLine {
  const dir = laneDir(shooter.side);
  const x0 = muzzle ? shooter.x + dir * muzzle.x : shooter.x + dir * shooter.halfWidth;
  const y0 = muzzle ? LANE_Y + muzzle.y : LANE_Y - UNIT_SHOT_HEIGHT;
  // The nearest living enemy ahead within reach (edge to edge).
  let target: Unit | null = null;
  let bestGap = Infinity;
  for (const other of units) {
    if (other.side === shooter.side || !other.onLane) continue;
    const ahead = (other.x - shooter.x) * dir;
    if (ahead < 0) continue;
    const gap = ahead - shooter.halfWidth - other.halfWidth;
    if (gap <= reach + 4 && gap < bestGap) {
      target = other;
      bestGap = gap;
    }
  }
  let x1: number;
  let y1: number;
  if (target) {
    x1 = target.x;
    y1 = target.centerY;
  } else if (base && !base.isDestroyed) {
    x1 = base.x;
    y1 = LANE_Y - BASE_AIM_HEIGHT;
  } else {
    x1 = x0 + dir * Math.max(40, reach);
    y1 = LANE_Y - UNIT_SHOT_HEIGHT;
  }
  // A target whose middle is already behind the muzzle: drop the shot into it.
  if ((x1 - x0) * dir < 6) x1 = x0 + dir * 6;
  return { x0, y0, x1, y1 };
}
