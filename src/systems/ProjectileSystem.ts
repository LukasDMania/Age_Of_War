import { GAME_HEIGHT, GAME_WIDTH, LANE_Y } from '@config/constants';
import { PROJECTILE_MAX_LIFETIME_MS } from '@config/projectiles.config';
import type { Base } from '@entities/Base';
import type { Projectile } from '@entities/Projectile';
import type { ProjectileFactory } from '@entities/ProjectileFactory';
import type { UnitFactory } from '@entities/UnitFactory';
import { otherSide, type Side } from '@state/types';
import { dealBaseDamage, dealSplashDamage, dealUnitDamage } from '@systems/damageOps';

/** How far past the screen edges a projectile may go before it is dropped. */
const OFFSCREEN_MARGIN = 60;

/**
 * Where a segment from (x0, y0) moving by (dx, dy) first enters a box, as a
 * fraction 0..1 of the segment, or -1 if it doesn't touch it (Liang-Barsky,
 * one axis at a time). A segment that starts inside the box enters at 0.
 * Written without closures or arrays: it runs per projectile per unit per frame.
 */
function entryFraction(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  let tEnter = 0;
  let tExit = 1;
  // X axis.
  if (dx === 0) {
    if (x0 < minX || x0 > maxX) return -1;
  } else {
    const a = (minX - x0) / dx;
    const b = (maxX - x0) / dx;
    tEnter = Math.max(tEnter, Math.min(a, b));
    tExit = Math.min(tExit, Math.max(a, b));
    if (tEnter > tExit) return -1;
  }
  // Y axis.
  if (dy === 0) {
    if (y0 < minY || y0 > maxY) return -1;
  } else {
    const a = (minY - y0) / dy;
    const b = (maxY - y0) / dy;
    tEnter = Math.max(tEnter, Math.min(a, b));
    tExit = Math.min(tExit, Math.max(a, b));
    if (tEnter > tExit) return -1;
  }
  return tEnter;
}

/**
 * Flies every projectile in a straight line and resolves what it hits: the
 * first enemy unit whose body its path crosses, else the enemy base (only
 * for shots that can hit it: units' level shots), else the ground. It never
 * hits its own side. The hit takes the shot's damage; splash, if any, is
 * centered where it hit.
 *
 * Emits (through damageOps): `unit-damaged`, `area-hit`, `base-damaged`,
 * `base-destroyed`.
 */
export class ProjectileSystem {
  private readonly projectiles: ProjectileFactory;
  private readonly units: UnitFactory;
  private readonly bases: Record<Side, Base>;
  /** Reused between frames so resolving impacts allocates nothing. */
  private readonly landed: Projectile[] = [];
  private readonly expired: Projectile[] = [];

  constructor(projectiles: ProjectileFactory, units: UnitFactory, bases: Record<Side, Base>) {
    this.projectiles = projectiles;
    this.units = units;
    this.bases = bases;
  }

  update(deltaMs: number): void {
    for (const projectile of this.projectiles.activeProjectiles) {
      projectile.ageMs += deltaMs;
      if (this.fly(projectile, deltaMs)) this.landed.push(projectile);
      else if (this.isLost(projectile)) this.expired.push(projectile);
    }
    for (const projectile of this.landed) {
      this.land(projectile);
      this.projectiles.release(projectile);
    }
    for (const projectile of this.expired) this.projectiles.release(projectile);
    this.landed.length = 0;
    this.expired.length = 0;
  }

  /**
   * Moves a projectile one step along its line, stopping at the first thing
   * it hits on the way. Returns true when it hit something.
   */
  private fly(projectile: Projectile, deltaMs: number): boolean {
    const step = (projectile.flight.speed * deltaMs) / 1000;
    const x0 = projectile.x;
    const y0 = projectile.y;
    const dx = projectile.dirX * step;
    const dy = projectile.dirY * step;
    const enemy = otherSide(projectile.side);

    let hitAt = Infinity;
    projectile.impactUnit = null;
    projectile.impactBase = null;
    for (const unit of this.units.activeUnits) {
      if (unit.side !== enemy || !unit.isAlive) continue;
      const t = entryFraction(x0, y0, dx, dy, unit.x - unit.halfWidth, unit.topY, unit.x + unit.halfWidth, unit.y);
      if (t >= 0 && t < hitAt) {
        hitAt = t;
        projectile.impactUnit = unit;
      }
    }
    if (projectile.hitsBase) {
      const base = this.bases[enemy];
      if (!base.isDestroyed) {
        const t = entryFraction(x0, y0, dx, dy, base.x - base.halfWidth, LANE_Y - base.displayHeight, base.x + base.halfWidth, LANE_Y);
        if (t >= 0 && t < hitAt) {
          hitAt = t;
          projectile.impactUnit = null;
          projectile.impactBase = base;
        }
      }
    }
    if (dy > 0) {
      const t = (LANE_Y - y0) / dy;
      if (t >= 0 && t <= 1 && t < hitAt) {
        hitAt = t;
        projectile.impactUnit = null;
        projectile.impactBase = null;
      }
    }

    if (hitAt === Infinity) {
      projectile.setPosition(x0 + dx, y0 + dy);
      return false;
    }
    projectile.impactX = x0 + dx * hitAt;
    projectile.setPosition(projectile.impactX, y0 + dy * hitAt);
    return true;
  }

  private isLost(projectile: Projectile): boolean {
    return (
      projectile.ageMs > PROJECTILE_MAX_LIFETIME_MS ||
      projectile.x < -OFFSCREEN_MARGIN ||
      projectile.x > GAME_WIDTH + OFFSCREEN_MARGIN ||
      projectile.y > GAME_HEIGHT
    );
  }

  private land(projectile: Projectile): void {
    const unit = projectile.impactUnit;
    if (unit) dealUnitDamage(unit, projectile.damage, projectile.side);
    else if (projectile.impactBase) dealBaseDamage(projectile.impactBase, projectile.damage);
    if (projectile.splashRadius > 0) {
      dealSplashDamage(
        this.units.activeUnits,
        projectile.impactX,
        projectile.splashRadius,
        projectile.damage,
        projectile.side,
        unit,
      );
    }
  }
}
