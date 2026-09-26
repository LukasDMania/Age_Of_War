/**
 * How projectiles fly, per projectile key. What they look like lives in
 * `utils/PlaceholderArt.ts`; what they do (damage, splash) comes from the
 * unit, turret or special that fired them.
 *
 * Owner rule (2026-09-23): a projectile flies in a straight line and hits the
 * first enemy it meets. Units shoot level along the lane, so a shot that
 * misses its original target (it died first) keeps going and hits the next
 * enemy, or the enemy base if nothing is left in the way. Turret shots and
 * special strikes fly straight at their aim point and hit the first enemy on
 * that line, or the ground. Nothing ever hits its own side. Numbers are
 * PROPOSED.
 */

export interface ProjectileFlight {
  /** Speed along its line, px/second. */
  speed: number;
  /** Turn the sprite to face its direction of travel (spears, meteors). */
  rotate: boolean;
}

export const DEFAULT_PROJECTILE_FLIGHT: ProjectileFlight = { speed: 420, rotate: false };

export const PROJECTILE_FLIGHT: Readonly<Record<string, ProjectileFlight>> = {
  'proj-stone': { speed: 380, rotate: false },
  'proj-spear': { speed: 560, rotate: true },
  'proj-boulder': { speed: 330, rotate: false },
  'proj-fire': { speed: 340, rotate: false },
  'proj-arrow': { speed: 560, rotate: true },
  'proj-bolt': { speed: 620, rotate: true },
  'proj-ballista': { speed: 540, rotate: true },
  'proj-oil': { speed: 320, rotate: false },
  'proj-bullet': { speed: 900, rotate: true },
  'proj-cannonball': { speed: 460, rotate: false },
  'proj-mortar': { speed: 400, rotate: false },
  'proj-shell': { speed: 620, rotate: true },
  'proj-grenade': { speed: 420, rotate: false },
  'proj-laser': { speed: 1000, rotate: true },
  'proj-rail': { speed: 1200, rotate: true },
  'proj-plasma': { speed: 480, rotate: false },
  // Special attack strikes fall from above the screen.
  'proj-meteor': { speed: 700, rotate: true },
  'proj-bomb': { speed: 640, rotate: true },
  'proj-orbital': { speed: 1100, rotate: true },
};

/**
 * Height above the lane at which units' shots fly (level). Every unit sprite
 * must be taller than this, or level shots would pass over it.
 */
export const UNIT_SHOT_HEIGHT = 26;

/** A projectile that hasn't hit anything after this long is dropped (safety net). */
export const PROJECTILE_MAX_LIFETIME_MS = 6000;

export function getProjectileFlight(key: string): ProjectileFlight {
  return PROJECTILE_FLIGHT[key] ?? DEFAULT_PROJECTILE_FLIGHT;
}
