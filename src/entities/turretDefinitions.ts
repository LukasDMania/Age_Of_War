/**
 * Every turret type, as data. Each age has three: rapid (fast, light), heavy
 * (slow, big hits) and area (splash). Turrets always target the front-most
 * enemy in range.
 *
 * All numbers are PROPOSED first-pass values. Upgrades follow a curve per
 * turret kind (`TURRET_UPGRADE_CURVES`, Phase 11). Later ages (Phase 8) scale the
 * Stone turrets by the same age factor as units (2.2, 4.8, 10.5, 23): price,
 * upgrade prices and damage per second. The rapid turrets of the Modern and
 * Future ages fire three times as often for a third of the damage.
 */
import {
  TURRET_SELL_REFUND,
  TURRET_SLOT_UNLOCK_COSTS,
  TURRET_UPGRADE_REFUND,
} from '@config/constants';
import type { TurretState } from '@state/GameState';

export type TurretKind = 'rapid' | 'heavy' | 'area';

export interface TurretUpgrade {
  /** Gold to buy this level. */
  cost: number;
  /** Multiplies damage, applied on top of earlier levels. */
  damageMult: number;
  /** Multiplies the cooldown (below 1 fires faster). */
  cooldownMult: number;
}

export interface TurretDefinition {
  id: string;
  name: string;
  /** 0-based index into the ages config. */
  age: number;
  kind: TurretKind;
  spriteKey: string;
  cost: number;
  damage: number;
  range: number;
  cooldownMs: number;
  splashRadius?: number;
  /** Absent means hitscan. */
  projectileKey?: string;
  /** Length is the maximum upgrade level. */
  upgrades: readonly TurretUpgrade[];
}

/* ---- Upgrade curves (Phase 11) ----------------------------------------- */

/** One upgrade level of a curve: price as a share of the turret's price. */
interface UpgradeStep {
  costShare: number;
  damageMult: number;
  cooldownMult: number;
}

/**
 * PROPOSED (Phase 11). Three upgrade levels per turret kind, with shrinking
 * returns. Damage per second after each level, compared with the fresh
 * turret: about 1.44x, 1.79x and 2.04x, for 50%, 75% and 110% of its price.
 * Rapid turrets mostly gain fire rate, heavy ones damage, area ones both.
 *
 * The intended trade-off (see the Phase 11 tuning check in the session log):
 * the first upgrade is the best damage per gold you can buy for a turret you
 * own; after an age-up, selling and rebuying the newer turret is better than
 * a second or third upgrade; a fully upgraded turret roughly matches a fresh
 * one from the next age but is far behind one from two ages later.
 */
export const TURRET_UPGRADE_CURVES: Readonly<Record<TurretKind, readonly UpgradeStep[]>> = {
  // Phase 15 (owner: max-level turrets too strong late): a full upgrade
  // path now gives about x1.55 damage per second instead of about x2.05.
  rapid: [
    { costShare: 0.5, damageMult: 1.1, cooldownMult: 0.9 },
    { costShare: 0.75, damageMult: 1.08, cooldownMult: 0.93 },
    { costShare: 1.1, damageMult: 1.06, cooldownMult: 0.96 },
  ],
  heavy: [
    { costShare: 0.5, damageMult: 1.2, cooldownMult: 1 },
    { costShare: 0.75, damageMult: 1.14, cooldownMult: 1 },
    { costShare: 1.1, damageMult: 1.12, cooldownMult: 1 },
  ],
  area: [
    { costShare: 0.5, damageMult: 1.15, cooldownMult: 0.92 },
    { costShare: 0.75, damageMult: 1.1, cooldownMult: 0.95 },
    { costShare: 1.1, damageMult: 1.06, cooldownMult: 0.97 },
  ],
};

/** A turret's upgrade levels: its kind's curve priced from its cost (rounded to 5). */
function upgradesFor(kind: TurretKind, cost: number): TurretUpgrade[] {
  return TURRET_UPGRADE_CURVES[kind].map((step) => ({
    cost: Math.max(5, Math.round((cost * step.costShare) / 5) * 5),
    damageMult: step.damageMult,
    cooldownMult: step.cooldownMult,
  }));
}

/* ---- Stone age -------------------------------------------------------- */

const STONE_TURRETS: readonly TurretDefinition[] = [
  {
    id: 'stone-spear-thrower',
    name: 'Spear Thrower',
    age: 0,
    kind: 'rapid',
    spriteKey: 'turret-stone-spear',
    cost: 60,
    damage: 6,
    range: 260,
    cooldownMs: 500,
    projectileKey: 'proj-spear',
    upgrades: upgradesFor('rapid', 60),
  },
  {
    id: 'stone-boulder-thrower',
    name: 'Boulder Thrower',
    age: 0,
    kind: 'heavy',
    spriteKey: 'turret-stone-boulder',
    cost: 120,
    damage: 40,
    range: 300,
    cooldownMs: 2200,
    projectileKey: 'proj-boulder',
    upgrades: upgradesFor('heavy', 120),
  },
  {
    id: 'stone-fire-pot',
    name: 'Fire Pot Lobber',
    age: 0,
    kind: 'area',
    spriteKey: 'turret-stone-firepot',
    cost: 100,
    damage: 14,
    range: 240,
    cooldownMs: 1600,
    splashRadius: 70,
    projectileKey: 'proj-fire',
    upgrades: upgradesFor('area', 100),
  },
];

/* ---- Castle age (factor 2.2) --------------------------------------- */

const CASTLE_TURRETS: readonly TurretDefinition[] = [
  {
    id: 'castle-crossbow-tower',
    name: 'Crossbow Tower',
    age: 1,
    kind: 'rapid',
    spriteKey: 'turret-castle-crossbow',
    cost: 130,
    damage: 13,
    range: 270,
    cooldownMs: 500,
    projectileKey: 'proj-bolt',
    upgrades: upgradesFor('rapid', 130),
  },
  {
    id: 'castle-ballista',
    name: 'Ballista',
    age: 1,
    kind: 'heavy',
    spriteKey: 'turret-castle-ballista',
    cost: 265,
    damage: 88,
    range: 320,
    cooldownMs: 2200,
    projectileKey: 'proj-ballista',
    upgrades: upgradesFor('heavy', 265),
  },
  {
    id: 'castle-oil-cauldron',
    name: 'Oil Cauldron',
    age: 1,
    kind: 'area',
    spriteKey: 'turret-castle-oil',
    cost: 220,
    damage: 31,
    range: 200,
    cooldownMs: 1600,
    splashRadius: 70,
    projectileKey: 'proj-oil',
    upgrades: upgradesFor('area', 220),
  },
];

/* ---- Renaissance age (factor 4.8) ---------------------------------- */

const RENAISSANCE_TURRETS: readonly TurretDefinition[] = [
  {
    id: 'renaissance-musket-nest',
    name: 'Musket Nest',
    age: 2,
    kind: 'rapid',
    spriteKey: 'turret-renaissance-musket',
    cost: 290,
    damage: 29,
    range: 280,
    cooldownMs: 500,
    projectileKey: 'proj-bullet',
    upgrades: upgradesFor('rapid', 290),
  },
  {
    id: 'renaissance-cannon',
    name: 'Cannon',
    age: 2,
    kind: 'heavy',
    spriteKey: 'turret-renaissance-cannon',
    cost: 575,
    damage: 192,
    range: 340,
    cooldownMs: 2200,
    projectileKey: 'proj-cannonball',
    upgrades: upgradesFor('heavy', 575),
  },
  {
    id: 'renaissance-mortar',
    name: 'Mortar',
    age: 2,
    kind: 'area',
    spriteKey: 'turret-renaissance-mortar',
    cost: 480,
    damage: 67,
    range: 280,
    cooldownMs: 1600,
    splashRadius: 80,
    projectileKey: 'proj-mortar',
    upgrades: upgradesFor('area', 480),
  },
];

/* ---- Modern age (factor 10.5) -------------------------------------- */

const MODERN_TURRETS: readonly TurretDefinition[] = [
  {
    id: 'modern-machine-gun',
    name: 'Machine Gun',
    age: 3,
    kind: 'rapid',
    spriteKey: 'turret-modern-machine-gun',
    cost: 630,
    damage: 21,
    range: 300,
    cooldownMs: 170,
    projectileKey: 'proj-bullet',
    upgrades: upgradesFor('rapid', 630),
  },
  {
    id: 'modern-artillery',
    name: 'Artillery Gun',
    age: 3,
    kind: 'heavy',
    spriteKey: 'turret-modern-artillery',
    cost: 1260,
    damage: 420,
    range: 360,
    cooldownMs: 2200,
    projectileKey: 'proj-shell',
    upgrades: upgradesFor('heavy', 1260),
  },
  {
    id: 'modern-grenade-launcher',
    name: 'Grenade Launcher',
    age: 3,
    kind: 'area',
    spriteKey: 'turret-modern-grenade',
    cost: 1050,
    damage: 147,
    range: 280,
    cooldownMs: 1600,
    splashRadius: 80,
    projectileKey: 'proj-grenade',
    upgrades: upgradesFor('area', 1050),
  },
];

/* ---- Future age (factor 23) ---------------------------------------- */

const FUTURE_TURRETS: readonly TurretDefinition[] = [
  {
    id: 'future-laser-turret',
    name: 'Laser Turret',
    age: 4,
    kind: 'rapid',
    spriteKey: 'turret-future-laser',
    cost: 1380,
    damage: 47,
    range: 320,
    cooldownMs: 170,
    projectileKey: 'proj-laser',
    upgrades: upgradesFor('rapid', 1380),
  },
  {
    id: 'future-rail-gun',
    name: 'Rail Gun',
    age: 4,
    kind: 'heavy',
    spriteKey: 'turret-future-rail',
    cost: 2760,
    damage: 920,
    range: 400,
    cooldownMs: 2200,
    projectileKey: 'proj-rail',
    upgrades: upgradesFor('heavy', 2760),
  },
  {
    id: 'future-plasma-mortar',
    name: 'Plasma Mortar',
    age: 4,
    kind: 'area',
    spriteKey: 'turret-future-plasma',
    cost: 2300,
    damage: 322,
    range: 300,
    cooldownMs: 1600,
    splashRadius: 90,
    projectileKey: 'proj-plasma',
    upgrades: upgradesFor('area', 2300),
  },
];

export const TURRET_DEFINITIONS: readonly TurretDefinition[] = [
  ...STONE_TURRETS,
  ...CASTLE_TURRETS,
  ...RENAISSANCE_TURRETS,
  ...MODERN_TURRETS,
  ...FUTURE_TURRETS,
];

const TURRETS_BY_ID: ReadonlyMap<string, TurretDefinition> = new Map(
  TURRET_DEFINITIONS.map((def) => [def.id, def]),
);

/** Looks up a turret definition, failing loudly on an unknown id. */
export function getTurretDefinition(id: string): TurretDefinition {
  const def = TURRETS_BY_ID.get(id);
  if (!def) throw new Error(`Unknown turret id: "${id}"`);
  return def;
}

/** Like `getTurretDefinition`, but undefined for an unknown id (validating requests). */
export function findTurretDefinition(id: string): TurretDefinition | undefined {
  return TURRETS_BY_ID.get(id);
}

/**
 * Gold returned for selling a built turret: `TURRET_SELL_REFUND` of its
 * price plus `TURRET_UPGRADE_REFUND` of what was spent upgrading it, rounded
 * down. Shared by `TurretSystem` and the HUD so the shown refund is the paid one.
 */
export function turretSellRefund(turret: TurretState): number {
  const def = getTurretDefinition(turret.turretId);
  return Math.floor(def.cost * TURRET_SELL_REFUND + turret.spent * TURRET_UPGRADE_REFUND);
}

/** Gold needed to unlock a slot, or undefined past the cap. */
export function slotUnlockCost(slotIndex: number): number | undefined {
  return TURRET_SLOT_UNLOCK_COSTS[slotIndex];
}
