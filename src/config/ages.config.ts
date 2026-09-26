/**
 * Age progression data. Age names live here and nowhere else. Each age
 * lists its five unit ids (slot 1..5), its three turret ids, its special,
 * the XP needed to leave it and its placeholder look.
 *
 * Numbers are PROPOSED (Phase 8). Later ages follow the Stone numbers scaled
 * by an age factor of about 2.2x per age (see `unitDefinitions.ts`): costs,
 * HP, damage, kill gold and kill XP all grow by it, so fights last about as
 * long in every age, while a unit of the next age is roughly twice as cost
 * effective as one of the age before. XP thresholds grow at the same pace,
 * so every age takes a similar number of same-age kills to leave.
 */

/**
 * The age's special attack (Phase 6). Every age uses the same mechanic, a
 * shower of strikes (owner decision: meteor-shower style): `strikes` falling
 * projectiles spread over `durationMs`, each aimed at a random enemy unit
 * and dealing `damage` to every enemy unit within `radius` of where it lands.
 * Bases are not hit. The look comes from `projectileKey`.
 */
export interface SpecialConfig {
  id: string;
  name: string;
  cooldownMs: number;
  strikes: number;
  durationMs: number;
  /** Damage per strike to every enemy unit inside its radius. */
  damage: number;
  /** Splash radius of each strike, px (edge distance, like all splash). */
  radius: number;
  projectileKey: string;
}

/** Placeholder look of an age (Phase 8): background and an accent color. */
export interface AgeVisuals {
  sky: number;
  ground: number;
  /** Badge color on this age's units and turrets, so ages are told apart. */
  accent: number;
}

export interface AgeConfig {
  index: number;
  name: string;
  /**
   * The age factor: Stone numbers times this give the age's unit and turret
   * prices and stats (hand-written in the definitions). Passive income uses
   * it too (Phase 13).
   */
  scale: number;
  /** XP needed to leave this age (it is spent); null for the final age. */
  xpToNext: number | null;
  /** Unit ids in slot order 1..5. */
  unitIds: readonly [string, string, string, string, string];
  turretIds: readonly string[];
  special: SpecialConfig;
  visuals: AgeVisuals;
}

/** Placeholder names for all five ages (PROPOSED, not final). */
export const AGE_NAMES = [
  'Stone',
  'Castle',
  'Renaissance',
  'Modern',
  'Future',
] as const;

export const AGE_COUNT = AGE_NAMES.length;

/** Every special recharges in the same time for now (owner: 75 s, 2026-09-26; was 45 s). */
const SPECIAL_COOLDOWN_MS = 75000;

export const AGES: readonly AgeConfig[] = [
  {
    index: 0,
    scale: 1,
    name: AGE_NAMES[0],
    xpToNext: 300,
    unitIds: ['stone-clubber', 'stone-slinger', 'stone-mammoth-rider', 'stone-trader', 'stone-shaman'],
    turretIds: ['stone-spear-thrower', 'stone-boulder-thrower', 'stone-fire-pot'],
    special: {
      id: 'stone-meteor-shower',
      name: 'Meteor Shower',
      cooldownMs: SPECIAL_COOLDOWN_MS,
      strikes: 12,
      durationMs: 2000,
      damage: 30,
      radius: 36,
      projectileKey: 'proj-meteor',
    },
    visuals: { sky: 0x87ceeb, ground: 0x6b8e4e, accent: 0x8b5a2b },
  },
  {
    index: 1,
    scale: 2.2,
    name: AGE_NAMES[1],
    xpToNext: 700,
    unitIds: ['castle-swordsman', 'castle-archer', 'castle-knight', 'castle-merchant', 'castle-catapult-crew'],
    turretIds: ['castle-crossbow-tower', 'castle-ballista', 'castle-oil-cauldron'],
    special: {
      id: 'castle-arrow-volley',
      name: 'Arrow Volley',
      cooldownMs: SPECIAL_COOLDOWN_MS,
      strikes: 20,
      durationMs: 1500,
      damage: 40,
      radius: 24,
      projectileKey: 'proj-arrow',
    },
    visuals: { sky: 0x9ec9e2, ground: 0x5f7f45, accent: 0xc8c8d0 },
  },
  {
    index: 2,
    scale: 4.8,
    name: AGE_NAMES[2],
    xpToNext: 1600,
    unitIds: [
      'renaissance-pikeman',
      'renaissance-musketeer',
      'renaissance-cuirassier',
      'renaissance-banker',
      'renaissance-alchemist',
    ],
    turretIds: ['renaissance-musket-nest', 'renaissance-cannon', 'renaissance-mortar'],
    special: {
      id: 'renaissance-cannon-barrage',
      name: 'Cannon Barrage',
      cooldownMs: SPECIAL_COOLDOWN_MS,
      strikes: 8,
      durationMs: 2000,
      damage: 216,
      radius: 50,
      projectileKey: 'proj-cannonball',
    },
    visuals: { sky: 0xb3c8d6, ground: 0x6f7d3f, accent: 0xe0b84a },
  },
  {
    index: 3,
    scale: 10.5,
    name: AGE_NAMES[3],
    xpToNext: 3600,
    unitIds: ['modern-rifleman', 'modern-sniper', 'modern-tank', 'modern-contractor', 'modern-officer'],
    turretIds: ['modern-machine-gun', 'modern-artillery', 'modern-grenade-launcher'],
    special: {
      id: 'modern-airstrike',
      name: 'Airstrike',
      cooldownMs: SPECIAL_COOLDOWN_MS,
      strikes: 10,
      durationMs: 1500,
      damage: 378,
      radius: 50,
      projectileKey: 'proj-bomb',
    },
    visuals: { sky: 0xa3b4bf, ground: 0x5d6650, accent: 0x9acd32 },
  },
  {
    index: 4,
    scale: 23,
    name: AGE_NAMES[4],
    xpToNext: null,
    unitIds: ['future-blade-trooper', 'future-laser-gunner', 'future-mech', 'future-broker-drone', 'future-shield-drone'],
    turretIds: ['future-laser-turret', 'future-rail-gun', 'future-plasma-mortar'],
    special: {
      id: 'future-orbital-strike',
      name: 'Orbital Strike',
      cooldownMs: SPECIAL_COOLDOWN_MS,
      strikes: 6,
      durationMs: 1500,
      damage: 1380,
      radius: 60,
      projectileKey: 'proj-orbital',
    },
    visuals: { sky: 0x4a5a7d, ground: 0x3f4a5a, accent: 0x00e5ff },
  },
];

/** Looks up an age config, failing loudly on a missing age. */
export function getAge(index: number): AgeConfig {
  const age = AGES[index];
  if (!age) {
    throw new Error(`Age ${index} (${AGE_NAMES[index] ?? 'unknown'}) does not exist`);
  }
  return age;
}

/** Whether an age is the last one (nothing to advance to). */
export function isFinalAge(index: number): boolean {
  return index >= AGES.length - 1;
}
