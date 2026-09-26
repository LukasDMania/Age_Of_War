/**
 * Buildings and Forge research (Phase 14, owner 2026-09-26; levels reworked
 * 2026-09-26, see below).
 *
 * LOCKED by the owner: a Mine, a Library and a Forge stand in a row behind
 * each base; they never spawn troops, can't be attacked, can't be sold, keep
 * their level on age-up and higher levels are locked behind ages. The Forge
 * level decides which research tier can be bought. Passive income is gone;
 * the Mine replaces it.
 *
 * Levels (2026-09-26, owner: "i don't like how its just 1 level then u
 * cant interact with them until you go to the next age"): five levels per
 * age, 25 in all. Each age opens five cheaper steps instead of one big one;
 * step prices within an age are `stepCosts`, times the age factor of the
 * tier. Output per level is small and steady (times the side's age factor,
 * as before). The look of a building changes every five levels (a stage per
 * age tier). Research tier N needs Forge level 5(N-1)+1 (1, 6, 11, 16, 21),
 * so research still opens one tier per age; the Forge's in-between levels
 * each give +1% damage to combat units.
 *
 * Prototype (feature `extraBuildings`): Barracks, Shrine and Market. Prototype
 * (feature `buildingPerks`): at every fifth level, pick one of two perks.
 *
 * All numbers below are PROPOSED first guesses, to be tuned in playtests.
 */
import { AGES } from '@config/ages.config';
import { feature } from '@config/features.config';
import type { Side } from '@state/types';

export type BuildingId = 'mine' | 'library' | 'forge' | 'barracks' | 'shrine' | 'market';

/** What a building's levels do, per level (see `buildingEffects`). */
export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  /** One line for the HUD. */
  blurb: string;
  /** Price of each of the five steps of a tier, Stone age money; later tiers x the tier's age factor. */
  stepCosts: readonly number[];
  spriteKey: string;
  /** Prototype buildings (feature `extraBuildings`). */
  extra?: boolean;
}

/** All buildings, in row order. Use `activeBuildingIds()` for the ones in play. */
export const BUILDING_IDS: readonly BuildingId[] = ['mine', 'library', 'forge', 'barracks', 'shrine', 'market'];

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDefinition>> = {
  mine: {
    id: 'mine',
    name: 'Mine',
    blurb: 'Makes gold',
    stepCosts: [40, 55, 70, 90, 110],
    spriteKey: 'building-mine',
  },
  library: {
    id: 'library',
    name: 'Library',
    blurb: 'Makes XP',
    stepCosts: [50, 65, 80, 100, 125],
    spriteKey: 'building-library',
  },
  forge: {
    id: 'forge',
    name: 'Forge',
    blurb: 'Research tiers, unit damage',
    stepCosts: [60, 75, 95, 120, 150],
    spriteKey: 'building-forge',
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    blurb: 'Faster training, tougher recruits',
    stepCosts: [60, 75, 95, 120, 150],
    spriteKey: 'building-barracks',
    extra: true,
  },
  shrine: {
    id: 'shrine',
    name: 'Shrine',
    blurb: 'Stronger, faster special',
    stepCosts: [70, 90, 110, 140, 170],
    spriteKey: 'building-shrine',
    extra: true,
  },
  market: {
    id: 'market',
    name: 'Market',
    blurb: 'Sells surplus XP for gold',
    stepCosts: [60, 80, 100, 125, 150],
    spriteKey: 'building-market',
    extra: true,
  },
};

/** The buildings in play this match (the prototype ones only with their feature on). */
export function activeBuildingIds(): readonly BuildingId[] {
  return feature('extraBuildings') ? BUILDING_IDS : BUILDING_IDS.filter((id) => !BUILDINGS[id].extra);
}

export const LEVELS_PER_AGE = 5;
export const MAX_BUILDING_LEVEL = LEVELS_PER_AGE * AGES.length;

/** Highest building level a side may reach in an age (0-based age index): 5, 10, ... 25. */
export function maxBuildingLevel(age: number): number {
  return Math.min(MAX_BUILDING_LEVEL, LEVELS_PER_AGE * (age + 1));
}

/** Look stage of a building at a level: 0 (Stone style) .. 4 (Future); -1 when not built. */
export function buildingStage(level: number): number {
  return level <= 0 ? -1 : Math.min(AGES.length - 1, Math.floor((level - 1) / LEVELS_PER_AGE));
}

/** Cost to go from `level` to `level + 1`, or null at max level. */
export function buildingUpgradeCost(id: BuildingId, level: number): number | null {
  if (level >= MAX_BUILDING_LEVEL) return null;
  const tier = Math.floor(level / LEVELS_PER_AGE);
  const step = level % LEVELS_PER_AGE;
  const base = BUILDINGS[id].stepCosts[step] ?? 0;
  return Math.round((base * (AGES[tier]?.scale ?? 1)) / 5) * 5;
}

/** Output per level before the age factor. */
export const BUILDING_OUTPUT = {
  /** Mine gold/s at level L: first + perLevel x (L - 1). */
  mine: { first: 0.4, perLevel: 0.2 },
  /** Library XP/s. */
  library: { first: 0.25, perLevel: 0.1 },
  /** Forge: damage of combat units per level. */
  forgeDamagePerLevel: 0.01,
  /** Barracks: training time per level (never below `barracksMinTime`), unit max HP per level. */
  barracksTimePerLevel: 0.02,
  barracksMinTime: 0.5,
  barracksHpPerLevel: 0.01,
  /** Shrine: special cooldown and special damage per level. */
  shrineCooldownPerLevel: 0.015,
  shrineDamagePerLevel: 0.03,
  /** Market: surplus XP it sells per second (first + perLevel x (L - 1), x age factor), gold per XP. */
  market: { first: 0.4, perLevel: 0.2, goldPerXp: 1.5 },
} as const;

/** Research tier `tier` (1..5) needs this Forge level. */
export function forgeLevelForTier(tier: number): number {
  return (tier - 1) * LEVELS_PER_AGE + 1;
}

/* ---- Perks (prototype, feature `buildingPerks`) -------------------------- */

export type PerkChoice = 'a' | 'b';

/** Multipliers a perk touches (see `buildingEffects`). */
export type PerkStat =
  | 'mineGold'
  | 'libraryXp'
  | 'killGold'
  | 'specialCooldown'
  | 'specialDamage'
  | 'researchCost'
  | 'unitHp'
  | 'unitDamage'
  | 'trainTime'
  | 'marketRate'
  | 'moneyIncome';

export interface BuildingPerk {
  name: string;
  about: string;
  stat: PerkStat;
  /** Multiplier per pick (picks of the same perk stack). */
  mult: number;
}

/**
 * Two perk paths per building; every fifth level (5, 10, ... 25) the owner
 * picks one of the two, and picks stack. PROPOSED.
 */
export const BUILDING_PERKS: Readonly<Record<BuildingId, Record<PerkChoice, BuildingPerk>>> = {
  mine: {
    a: { name: 'Deep veins', about: 'Mine +15% gold', stat: 'mineGold', mult: 1.15 },
    b: { name: 'Prospectors', about: '+8% gold from kills', stat: 'killGold', mult: 1.08 },
  },
  library: {
    a: { name: 'Scholars', about: 'Library +15% XP', stat: 'libraryXp', mult: 1.15 },
    b: { name: 'Strategists', about: 'Special recharges 6% faster', stat: 'specialCooldown', mult: 0.94 },
  },
  forge: {
    a: { name: 'Master smiths', about: 'Research 10% cheaper', stat: 'researchCost', mult: 0.9 },
    b: { name: 'Tempered steel', about: 'Units +4% max HP', stat: 'unitHp', mult: 1.04 },
  },
  barracks: {
    a: { name: 'Drill sergeants', about: 'Training 6% faster', stat: 'trainTime', mult: 0.94 },
    b: { name: 'Hardened recruits', about: 'Units +4% damage', stat: 'unitDamage', mult: 1.04 },
  },
  shrine: {
    a: { name: 'Devotion', about: 'Special +10% damage', stat: 'specialDamage', mult: 1.1 },
    b: { name: 'Omens', about: 'Special recharges 6% faster', stat: 'specialCooldown', mult: 0.94 },
  },
  market: {
    a: { name: 'Merchant guild', about: 'Market trades 20% more', stat: 'marketRate', mult: 1.2 },
    b: { name: 'Caravans', about: 'Money units +10% income', stat: 'moneyIncome', mult: 1.1 },
  },
};

/** Perks earned but not yet picked for a building (0 when perks are off). */
export function perksPending(level: number, picked: number): number {
  if (!feature('buildingPerks')) return 0;
  return Math.max(0, Math.floor(level / LEVELS_PER_AGE) - picked);
}

export function emptyPerks(): Record<BuildingId, PerkChoice[]> {
  return { mine: [], library: [], forge: [], barracks: [], shrine: [], market: [] };
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
  return { mine: 0, library: 0, forge: 0, barracks: 0, shrine: 0, market: 0 };
}

/**
 * Where buildings stand: in a row behind each base, off the default screen.
 * The player scrolls the camera left to see theirs (PROPOSED layout).
 */
export const BUILDING_LAYOUT = {
  /** Distance from the base center to the first building's center. */
  firstOffsetX: 210,
  spacingX: 170,
  /** How far the camera may scroll past each screen edge (grows with the row, see `scrollMargin`). */
  scrollMarginX: 560,
  size: { w: 130, h: 110 },
} as const;

/** How far the camera may scroll past each screen edge for the buildings in play. */
export function scrollMargin(): number {
  const count = activeBuildingIds().length;
  return Math.max(BUILDING_LAYOUT.scrollMarginX, BUILDING_LAYOUT.firstOffsetX + (count - 1) * BUILDING_LAYOUT.spacingX + 60);
}

/**
 * X of a building. The row reads left to right in `activeBuildingIds()`
 * order on both sides (Mine, Library, Forge, ...), matching the HUD cards.
 */
export function buildingX(side: Side, baseX: number, index: number): number {
  const count = activeBuildingIds().length;
  if (side === 'player') {
    return baseX - BUILDING_LAYOUT.firstOffsetX - (count - 1 - index) * BUILDING_LAYOUT.spacingX;
  }
  return baseX + BUILDING_LAYOUT.firstOffsetX + index * BUILDING_LAYOUT.spacingX;
}
