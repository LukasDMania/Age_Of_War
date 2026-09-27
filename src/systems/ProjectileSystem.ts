import { GAME_HEIGHT, GAME_WIDTH, LANE_Y } from '@config/constants';
import { PROJECTILE_MAX_LIFETIME_MS } from '@config/projectiles.config';
import type { Base } from '@entities/Base';
import type { Projectile } from '@entities/Projectile';
import type { Unit } from '@entities/Unit';
import type { ProjectileFactory } from '@entities/ProjectileFactory';
import type { UnitFactory } from '@entities/UnitFactory';
import type { MatchState } from '@state/GameState';
import { otherSide, type Side } from '@state/types';
import { dealBaseDamage, dealBounceDamage, dealSplashDamage, dealUnitDamage } from '@systems/damageOps';
import { applyModifier } from '@systems/statusOps';
import { emit, Events } from '@utils/EventBus';

/** How far past the screen edges a projectile may go before it is dropped. */
const OFFSCREEN_MARGIN = 60;
/** How far behind its target a ricochet can reach (Conquest's Ricochet trait), px. */
const BOUNCE_REACH = 110;

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
 * Side traits (Conquest rewards, `SideState.traits`) of the side that fired
 * it: a piercing shot flies on through its first unit; a unit's shot can
 * mark what it hits (a timed `damageTaken` modifier); a turret's shot can
 * ricochet to the next enemy; a slot's shots can hurt bases more.
 *
 * Emits: `projectile-impact` (feedback); through damageOps `unit-damaged`,
 * `area-hit`, `base-damaged`, `base-destroyed`, `shot-bounced`; through
 * statusOps `modifier-applied`.
 */
export class ProjectileSystem {
  private readonly state: MatchState;
  private readonly projectiles: ProjectileFactory;
  private readonly units: UnitFactory;
  private readonly bases: Record<Side, Base>;
  /** Reused between frames so resolving impacts allocates nothing. */
  private readonly landed: Projectile[] = [];
  private readonly expired: Projectile[] = [];
  private nowMs = 0;

  constructor(state: MatchState, projectiles: ProjectileFactory, units: UnitFactory, bases: Record<Side, Base>) {
    this.state = state;
    this.projectiles = projectiles;
    this.units = units;
    this.bases = bases;
  }

  /** `deltaMs` is simulation time; `nowMs` the simulation clock (for timed marks). */
  update(deltaMs: number, nowMs = 0): void {
    this.nowMs = nowMs;
    for (const projectile of this.projectiles.activeProjectiles) {
      projectile.ageMs += deltaMs;
      if (this.fly(projectile, deltaMs)) this.landed.push(projectile);
      else if (this.isLost(projectile)) this.expired.push(projectile);
    }
    for (const projectile of this.landed) {
      // A piercing shot goes on through its first unit.
      if (projectile.impactUnit && projectile.pierceLeft > 0) {
        projectile.pierceLeft--;
        projectile.ignoreUnit = projectile.impactUnit;
        this.land(projectile);
        continue;
      }
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
      if (unit.side !== enemy || !unit.isAlive || unit === projectile.ignoreUnit) continue;
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
    emit(Events.ProjectileImpact, {
      side: projectile.side,
      key: projectile.key,
      x: projectile.x,
      y: projectile.y,
      radius: projectile.splashRadius,
      target: unit ? 'unit' : projectile.impactBase ? 'base' : 'ground',
    });
    const traits = this.state[projectile.side].traits;
    const slot = projectile.sourceSlot;
    const baseMult = slot > 0 ? (traits.baseDamage[slot as 1] ?? 1) : 1;
    if (unit) {
      dealUnitDamage(unit, projectile.damage, projectile.side, true, projectile.turretSlot);
      this.afterUnitHit(projectile, unit);
    } else if (projectile.impactBase) {
      dealBaseDamage(projectile.impactBase, projectile.damage * baseMult);
    }
    if (projectile.splashRadius > 0) {
      // Units' shots (`hitsBase`) splash onto the enemy base too, unless they
      // already hit it directly; turret and special shots only hurt units.
      const base = projectile.hitsBase && !projectile.impactBase ? this.bases[otherSide(projectile.side)] : null;
      dealSplashDamage(
        this.units.activeUnits,
        projectile.impactX,
        projectile.splashRadius,
        projectile.damage,
        projectile.side,
        unit,
        base,
        { shot: true, turretSlot: projectile.turretSlot, baseMult },
      );
    }
  }

  /** Marks and ricochets (side traits) after a shot hit a unit. */
  private afterUnitHit(projectile: Projectile, unit: Unit): void {
    const traits = this.state[projectile.side].traits;
    const mark = projectile.sourceSlot > 0 ? traits.mark[projectile.sourceSlot as 1] : undefined;
    if (mark && unit.isAlive) {
      applyModifier(unit, { id: 'trait-mark', source: 'conquest', stat: 'damageTaken', mult: mark.mult, expiresAt: this.nowMs + mark.durationMs });
    }
    const bounce = projectile.turretKind ? traits.turretBounce[projectile.turretKind] : undefined;
    if (bounce) dealBounceDamage(this.units.activeUnits, unit, projectile.damage * bounce, projectile.side, BOUNCE_REACH, projectile.turretSlot);
  }
}
