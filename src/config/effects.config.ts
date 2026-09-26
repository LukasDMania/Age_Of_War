/**
 * Visual effects tunables (owner, 2026-09-26: "flesh out the projectile art
 * and other effects art. Make a more graceful impact shake for the heavy
 * units"). Pure feedback: nothing here changes the rules.
 */

/** How a projectile's hit looks. */
export type ImpactStyle =
  | 'dust'
  | 'splinter'
  | 'fire'
  | 'oil'
  | 'bullet'
  | 'cannon'
  | 'explosion'
  | 'laser'
  | 'rail'
  | 'plasma'
  | 'meteor'
  | 'orbital';

export const PROJECTILE_IMPACT: Readonly<Record<string, ImpactStyle>> = {
  'proj-stone': 'dust',
  'proj-boulder': 'dust',
  'proj-spear': 'splinter',
  'proj-arrow': 'splinter',
  'proj-bolt': 'splinter',
  'proj-ballista': 'splinter',
  'proj-fire': 'fire',
  'proj-meteor': 'meteor',
  'proj-oil': 'oil',
  'proj-bullet': 'bullet',
  'proj-cannonball': 'cannon',
  'proj-mortar': 'explosion',
  'proj-shell': 'explosion',
  'proj-grenade': 'explosion',
  'proj-bomb': 'explosion',
  'proj-laser': 'laser',
  'proj-rail': 'rail',
  'proj-plasma': 'plasma',
  'proj-orbital': 'orbital',
};

/** What a projectile leaves behind in flight. */
export type TrailStyle = 'smoke' | 'fire' | 'spark' | 'laser' | 'plasma' | 'rail' | 'steam';

export const PROJECTILE_TRAIL: Readonly<Partial<Record<string, TrailStyle>>> = {
  'proj-fire': 'fire',
  'proj-meteor': 'fire',
  'proj-oil': 'steam',
  'proj-cannonball': 'smoke',
  'proj-mortar': 'spark',
  'proj-shell': 'smoke',
  'proj-grenade': 'smoke',
  'proj-bomb': 'smoke',
  'proj-laser': 'laser',
  'proj-rail': 'rail',
  'proj-plasma': 'plasma',
  'proj-orbital': 'rail',
};

/** Real ms between trail particles of one projectile. */
export const TRAIL_INTERVAL_MS = 28;

/** Spin of round projectiles in flight, radians per second (visual). */
export const PROJECTILE_SPIN: Readonly<Partial<Record<string, number>>> = {
  'proj-stone': 9,
  'proj-boulder': 5,
  'proj-cannonball': 6,
  'proj-mortar': 4,
  'proj-grenade': 8,
  'proj-oil': 3,
};

/**
 * A graceful camera "thump": a damped vertical bounce instead of Phaser's
 * random jitter. `amplitude` in px, `cycles` bounces over `durationMs`;
 * `cooldownMs` keeps one kind from stacking up (the old mortar shake shook
 * the screen constantly, owner 2026-09-26).
 */
export interface ThumpConfig {
  amplitude: number;
  durationMs: number;
  cycles: number;
  cooldownMs: number;
}

export const CAMERA_THUMP: {
  /** A heavy unit's (slot 3) blow or shell landing. */
  heavyStrike: ThumpConfig;
  /** The player's base taking a hit. */
  baseHit: ThumpConfig;
  /** Big explosions (splash radius >= `bigBlastRadius`): specials, heavy shells. */
  bigBlast: ThumpConfig;
  baseDestroyed: ThumpConfig;
  bigBlastRadius: number;
  /** The bounce never exceeds this, however many thumps overlap. */
  maxOffset: number;
} = {
  heavyStrike: { amplitude: 1.6, durationMs: 340, cycles: 1.5, cooldownMs: 450 },
  baseHit: { amplitude: 1.2, durationMs: 240, cycles: 1.5, cooldownMs: 700 },
  bigBlast: { amplitude: 1.4, durationMs: 300, cycles: 1.5, cooldownMs: 600 },
  baseDestroyed: { amplitude: 7, durationMs: 1100, cycles: 4, cooldownMs: 0 },
  bigBlastRadius: 50,
  maxOffset: 8,
};

/** Unit ids that blow up (instead of falling) when they die. */
export const EXPLODING_UNITS: ReadonlySet<string> = new Set([
  'modern-tank',
  'future-mech',
  'future-broker-drone',
  'future-shield-drone',
]);

/** How long scorch marks stay on the ground, real ms. */
export const SCORCH_MS = 5000;
