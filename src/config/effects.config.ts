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
  /** Big explosions: special strikes (meteors, bombs, orbital) and exploding tanks and mechs, never turret splashes. */
  bigBlast: ThumpConfig;
  baseDestroyed: ThumpConfig;
  /** The bounce never exceeds this, however many thumps overlap. */
  maxOffset: number;
} = {
  heavyStrike: { amplitude: 1.6, durationMs: 340, cycles: 1.5, cooldownMs: 450 },
  baseHit: { amplitude: 1.2, durationMs: 240, cycles: 1.5, cooldownMs: 700 },
  bigBlast: { amplitude: 1.4, durationMs: 300, cycles: 1.5, cooldownMs: 600 },
  baseDestroyed: { amplitude: 7, durationMs: 1100, cycles: 4, cooldownMs: 0 },
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

/* ---- Effects rehaul (2026-09-28, owner: "a lot of the effects and projectiles can have something more to it") ---- */

/**
 * The motion streak drawn behind a projectile in flight (and a glow on its
 * head): `color`, `length` and `width` in px, `alpha` at the head fading to
 * nothing at the tail; `add` draws it additively (light: fire, tracers,
 * energy), otherwise normally (dust, smoke). The streak never reaches back
 * past where the shot started.
 */
export interface StreakStyle {
  color: number;
  length: number;
  width: number;
  alpha: number;
  add: boolean;
  glow?: { color: number; radius: number; alpha: number };
}

export const PROJECTILE_STREAK: Readonly<Partial<Record<string, StreakStyle>>> = {
  'proj-stone': { color: 0xd8c8a8, length: 16, width: 2.6, alpha: 0.4, add: false },
  'proj-boulder': { color: 0xc8b89a, length: 26, width: 6, alpha: 0.32, add: false },
  'proj-spear': { color: 0xffffff, length: 24, width: 1.8, alpha: 0.45, add: true },
  'proj-arrow': { color: 0xffffff, length: 26, width: 1.6, alpha: 0.5, add: true },
  'proj-bolt': { color: 0xffffff, length: 30, width: 1.8, alpha: 0.55, add: true },
  'proj-ballista': { color: 0xffffff, length: 38, width: 2.6, alpha: 0.5, add: true },
  'proj-fire': { color: 0xff9a3a, length: 30, width: 7, alpha: 0.75, add: true, glow: { color: 0xffa040, radius: 16, alpha: 0.55 } },
  'proj-meteor': { color: 0xff8a2a, length: 70, width: 12, alpha: 0.85, add: true, glow: { color: 0xffb040, radius: 30, alpha: 0.65 } },
  'proj-oil': { color: 0x3a2e1c, length: 18, width: 4, alpha: 0.35, add: false },
  'proj-bullet': { color: 0xffe07a, length: 38, width: 2.2, alpha: 0.95, add: true, glow: { color: 0xffd070, radius: 6, alpha: 0.7 } },
  'proj-cannonball': { color: 0x6a6560, length: 28, width: 6, alpha: 0.4, add: false },
  'proj-mortar': { color: 0xffc070, length: 20, width: 3, alpha: 0.65, add: true, glow: { color: 0xffb040, radius: 7, alpha: 0.5 } },
  'proj-shell': { color: 0xffd080, length: 30, width: 3.2, alpha: 0.7, add: true, glow: { color: 0xffb040, radius: 9, alpha: 0.55 } },
  'proj-grenade': { color: 0x8a857c, length: 16, width: 3, alpha: 0.35, add: false },
  'proj-bomb': { color: 0x8a857c, length: 26, width: 5, alpha: 0.4, add: false },
  'proj-laser': { color: 0x7ff8ff, length: 48, width: 3.6, alpha: 0.95, add: true, glow: { color: 0x5ff5e0, radius: 12, alpha: 0.6 } },
  'proj-rail': { color: 0xe8f8ff, length: 80, width: 3.2, alpha: 1, add: true, glow: { color: 0x9fd8ff, radius: 14, alpha: 0.65 } },
  'proj-plasma': { color: 0xc080ff, length: 36, width: 9, alpha: 0.85, add: true, glow: { color: 0xb070ff, radius: 18, alpha: 0.75 } },
  'proj-orbital': { color: 0xe8ffff, length: 100, width: 9, alpha: 0.9, add: true, glow: { color: 0xaef8ff, radius: 26, alpha: 0.75 } },
};

/** How a unit's shot leaves the weapon (by projectile key): the flash and puff at the muzzle. */
export type MuzzleStyle = 'gun' | 'cannon' | 'bow' | 'sling' | 'fire' | 'laser' | 'plasma';

export const MUZZLE_STYLE: Readonly<Partial<Record<string, MuzzleStyle>>> = {
  'proj-stone': 'sling',
  'proj-boulder': 'sling',
  'proj-spear': 'bow',
  'proj-arrow': 'bow',
  'proj-bolt': 'bow',
  'proj-ballista': 'bow',
  'proj-fire': 'fire',
  'proj-bullet': 'gun',
  'proj-cannonball': 'cannon',
  'proj-shell': 'cannon',
  'proj-mortar': 'cannon',
  'proj-grenade': 'gun',
  'proj-laser': 'laser',
  'proj-rail': 'laser',
  'proj-plasma': 'plasma',
};

/** Tint of melee slash arcs per age (index = age); the Future's glow. */
export const SLASH_TINTS: readonly number[] = [0xfff0d0, 0xffffff, 0xfff6e0, 0xffffff, 0x9ff8ff];

/** The sky flash when a special fires, per age: color and strength (0-1). */
export const SPECIAL_SKY_FLASH: readonly { color: number; alpha: number }[] = [
  { color: 0xff8a3a, alpha: 0.28 },
  { color: 0xffe0a0, alpha: 0.2 },
  { color: 0xffc070, alpha: 0.24 },
  { color: 0xffe0a0, alpha: 0.26 },
  { color: 0xbff8ff, alpha: 0.32 },
];
