/**
 * Buildings and Forge research (Phase 14, owner 2026-09-26).
 *
 * LOCKED by the owner: a Mine, a Library and a Forge stand in a row behind
 * each base; they never spawn troops, can't be attacked, can't be sold, keep
 * their level on age-up and higher levels are locked behind ages. The Forge
 * level decides which research tier can be bought. Passive income is gone;
 * the Mine replaces it.
 *
 * All numbers below are PROPOSED first guesses, to be tuned in playtests.
 */
import type { Side } from '@state/types';

export type BuildingId = 'mine' | 'library' | 'forge';

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  /** One line for the HUD. */
  blurb: string;
  /** Gold cost to reach level 1..5 (index 0 builds it). */
  costs: readonly number[];
  /** Mine: gold/s per level (index 0 = level 1), times the side's age factor. */
  goldPerSec?: readonly number[];
  /** Library: XP/s per level, times the side's age factor. */
  xpPerSec?: readonly number[];
  spriteKey: string;
}

export const BUILDING_IDS: readonly BuildingId[] = ['mine', 'library', 'forge'];

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDefinition>> = {
  mine: {
    id: 'mine',
    name: 'Mine',
    blurb: 'Makes gold',
    costs: [60, 220, 800, 2200, 5500],
    goldPerSec: [1, 1.5, 2, 2.5, 3],
    spriteKey: 'building-mine',
  },
  library: {
    id: 'library',
    name: 'Library',
    blurb: 'Makes XP',
    costs: [80, 260, 900, 2400, 6000],
    xpPerSec: [0.5, 0.8, 1.1, 1.4, 1.8],
    spriteKey: 'building-library',
  },
  forge: {
    id: 'forge',
    name: 'Forge',
    blurb: 'Unlocks research tiers',
    costs: [100, 300, 1000, 2600, 6000],
    spriteKey: 'building-forge',
  },
};

export const MAX_BUILDING_LEVEL = 5;

/** Highest building level a side may reach in an age (0-based age index). */
export function maxBuildingLevel(age: number): number {
  return Math.min(MAX_BUILDING_LEVEL, age + 1);
}

/** Cost to go from `level` to `level + 1`, or null at max level. */
export function buildingUpgradeCost(id: BuildingId, level: number): number | null {
  return BUILDINGS[id].costs[level] ?? null;
}

/* ---- Research ----------------------------------------------------------- */

export type ResearchId =
  | 'bounty'
  | 'meleeDamage'
  | 'meleeArmor'
  | 'rangedDamage'
  | 'rangedRange'
  | 'heavyDamage'
  | 'heavyArmor'
  | 'turretDamage'
  | 'turretRange';

/**
 * What a research track changes:
 * - `unit`: a side-wide modifier (see `statusOps.setSideModifier`) on the units
 *   of the listed slots. Armor is the `damageTaken` stat going down.
 * - `turret`: read by `Turret.getStat` from the side's research tiers.
 * - `bounty`: read by `EconomySystem` when paying kill gold.
 */
export type ResearchTarget =
  | { kind: 'unit'; slots: readonly (1 | 2 | 3 | 4 | 5)[]; stat: 'damage' | 'range' | 'damageTaken' }
  | { kind: 'turret'; stat: 'damage' | 'range' }
  | { kind: 'bounty' };

export interface ResearchDefinition {
  id: ResearchId;
  name: string;
  /** Short label for the HUD grid. */
  short: string;
  target: ResearchTarget;
  /**
   * Change per tier, added up (not compounded): 0.1 means +10% per tier.
   * Negative for armor (damage taken goes down).
   */
  perTier: number;
  /** Tier 1 cost; later tiers multiply it by `RESEARCH_TIER_COST_MULT`. */
  baseCost: number;
}

export const MAX_RESEARCH_TIER = 5;

/** Cost multiplier per tier, roughly following the age factor. */
export const RESEARCH_TIER_COST_MULT: readonly number[] = [1, 2.5, 6, 13, 28];

export const RESEARCH: readonly ResearchDefinition[] = [
  { id: 'bounty', name: 'Plunder', short: 'Kill gold', target: { kind: 'bounty' }, perTier: 0.1, baseCost: 60 },
  { id: 'meleeDamage', name: 'Sharpened weapons', short: 'Melee dmg', target: { kind: 'unit', slots: [1], stat: 'damage' }, perTier: 0.1, baseCost: 50 },
  { id: 'meleeArmor', name: 'Melee armor', short: 'Melee armor', target: { kind: 'unit', slots: [1], stat: 'damageTaken' }, perTier: -0.06, baseCost: 50 },
  { id: 'rangedDamage', name: 'Better ammo', short: 'Ranged dmg', target: { kind: 'unit', slots: [2], stat: 'damage' }, perTier: 0.1, baseCost: 50 },
  { id: 'rangedRange', name: 'Keen eyes', short: 'Ranged range', target: { kind: 'unit', slots: [2], stat: 'range' }, perTier: 0.08, baseCost: 50 },
  { id: 'heavyDamage', name: 'Heavy weapons', short: 'Heavy dmg', target: { kind: 'unit', slots: [3], stat: 'damage' }, perTier: 0.1, baseCost: 70 },
  { id: 'heavyArmor', name: 'Heavy plating', short: 'Heavy armor', target: { kind: 'unit', slots: [3], stat: 'damageTaken' }, perTier: -0.06, baseCost: 70 },
  { id: 'turretDamage', name: 'Turret power', short: 'Turret dmg', target: { kind: 'turret', stat: 'damage' }, perTier: 0.05, baseCost: 60 },
  { id: 'turretRange', name: 'Turret sights', short: 'Turret range', target: { kind: 'turret', stat: 'range' }, perTier: 0.03, baseCost: 60 },
];

export function getResearch(id: ResearchId): ResearchDefinition {
  const def = RESEARCH.find((r) => r.id === id);
  if (!def) throw new Error(`Unknown research: ${id}`);
  return def;
}

/** Cost of buying tier `tier + 1` (tier = tiers owned), or null when maxed. */
export function researchCost(id: ResearchId, tier: number): number | null {
  const mult = RESEARCH_TIER_COST_MULT[tier];
  return mult === undefined ? null : Math.round(getResearch(id).baseCost * mult);
}

/** The multiplier a track gives at a tier (1 at tier 0). */
export function researchMult(id: ResearchId, tier: number): number {
  return 1 + getResearch(id).perTier * tier;
}

/** Research tiers start at 0 for every track. */
export function emptyResearch(): Record<ResearchId, number> {
  const tiers = {} as Record<ResearchId, number>;
  for (const r of RESEARCH) tiers[r.id] = 0;
  return tiers;
}

export function emptyBuildings(): Record<BuildingId, number> {
  return { mine: 0, library: 0, forge: 0 };
}

/**
 * Where buildings stand: in a row behind each base, off the default screen.
 * The player scrolls the camera left to see theirs (PROPOSED layout).
 */
export const BUILDING_LAYOUT = {
  /** Distance from the base center to the first building's center. */
  firstOffsetX: 210,
  spacingX: 170,
  /** How far the camera may scroll past each screen edge. */
  scrollMarginX: 560,
  size: { w: 130, h: 110 },
} as const;

/**
 * X of a building. The row reads left to right in `BUILDING_IDS` order on
 * both sides (Mine, Library, Forge), matching the HUD cards.
 */
export function buildingX(side: Side, baseX: number, index: number): number {
  const count = BUILDING_IDS.length;
  if (side === 'player') {
    return baseX - BUILDING_LAYOUT.firstOffsetX - (count - 1 - index) * BUILDING_LAYOUT.spacingX;
  }
  return baseX + BUILDING_LAYOUT.firstOffsetX + index * BUILDING_LAYOUT.spacingX;
}
