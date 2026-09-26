/**
 * Enemy AI difficulty presets (Phase 12). The AI plays by the player's rules:
 * it only emits the same `*-requested` events and has no gold, XP or stat
 * bonus. Difficulty comes from how fast it reacts and how well it plays.
 * All numbers are PROPOSED.
 */

export type AiDifficultyName = 'easy' | 'normal' | 'hard';

export interface AiDifficulty {
  name: AiDifficultyName;
  /** Shown on the menu. */
  label: string;
  description: string;
  /** How often it makes decisions (its reaction delay), in ms. */
  thinkIntervalMs: number;
  /** 'random' picks slots 1-3 at random; 'counter' answers what the player fields. */
  unitChoice: 'random' | 'counter';
  /** Keeps at most this many units in its training queue. */
  maxQueue: number;
  /** Most money units it keeps alive at once (0 = never buys them). */
  economyUnitsMax: number;
  /** Buys a money unit only if its army is worth this many times the player's. */
  economySafetyRatio: number;
  /** Buys a utility unit after every this many combat units (0 = never). */
  utilityEvery: number;
  /** Earliest simulation time it builds its first turret, in ms. */
  firstTurretAtMs: number;
  /** Turret slots it will fill (unlocking them as needed), 1-5. */
  turretSlots: number;
  /** Highest upgrade level it buys for its turrets (0 = none). */
  turretUpgradeLevel: number;
  /** After an age-up, sells outdated turrets and builds the new age's. */
  modernizesTurrets: boolean;
  /** Waits this long after it has the XP before ageing up, in ms. */
  ageUpDelayMs: number;
  /** Fires the special when at least this many player units are on the lane. */
  specialMinTargets: number;
  /** Only fires the special while player units are near its base. */
  specialOnlyWhenThreatened: boolean;
  /** Highest level it takes its buildings to (Phase 14; also capped by age). */
  buildingLevelCap: number;
  /** Highest Forge research tier it buys (Phase 14); 0 = no research. */
  researchTierCap: number;
}

export const AI_DIFFICULTIES: Readonly<Record<AiDifficultyName, AiDifficulty>> = {
  easy: {
    name: 'easy',
    label: 'Easy',
    description: 'Slow and forgiving. Picks units at random, builds little.',
    thinkIntervalMs: 2000,
    unitChoice: 'random',
    maxQueue: 2,
    economyUnitsMax: 0,
    economySafetyRatio: Infinity,
    utilityEvery: 0,
    firstTurretAtMs: 150000,
    turretSlots: 1,
    turretUpgradeLevel: 0,
    modernizesTurrets: false,
    ageUpDelayMs: 40000,
    specialMinTargets: 6,
    specialOnlyWhenThreatened: true,
    buildingLevelCap: 2,
    researchTierCap: 1,
  },
  normal: {
    name: 'normal',
    label: 'Normal',
    description: 'Counters your army, builds turrets, saves its special for defence.',
    thinkIntervalMs: 1200,
    unitChoice: 'counter',
    maxQueue: 2,
    economyUnitsMax: 1,
    economySafetyRatio: 1.6,
    utilityEvery: 6,
    firstTurretAtMs: 60000,
    turretSlots: 2,
    turretUpgradeLevel: 1,
    modernizesTurrets: false,
    ageUpDelayMs: 8000,
    specialMinTargets: 4,
    specialOnlyWhenThreatened: true,
    buildingLevelCap: 4,
    researchTierCap: 3,
  },
  hard: {
    name: 'hard',
    label: 'Hard',
    description: 'Fast. Upgrades everything and fires its special on cooldown.',
    thinkIntervalMs: 500,
    unitChoice: 'counter',
    maxQueue: 3,
    economyUnitsMax: 2,
    economySafetyRatio: 1.25,
    utilityEvery: 4,
    firstTurretAtMs: 25000,
    turretSlots: 3,
    turretUpgradeLevel: 3,
    modernizesTurrets: true,
    ageUpDelayMs: 0,
    specialMinTargets: 3,
    specialOnlyWhenThreatened: false,
    buildingLevelCap: 5,
    researchTierCap: 5,
  },
};

/** Difficulty used when none is chosen (the `?ai=` URL parameter overrides it). */
export const DEFAULT_AI_DIFFICULTY: AiDifficultyName = 'normal';

/** In menu order. */
export const AI_DIFFICULTY_NAMES: readonly AiDifficultyName[] = ['easy', 'normal', 'hard'];

/**
 * With at least this many times its age's heavy unit (slot 3) price in the
 * bank, the AI fills its whole training queue instead of `maxQueue`, so gold
 * doesn't pile up in long games (Phase 13).
 */
export const AI_RICH_GOLD_MULT = 4;

/** Player units within this distance of the AI's base count as a threat. */
export const AI_THREAT_DISTANCE = 420;

export function isAiDifficultyName(value: unknown): value is AiDifficultyName {
  return value === 'easy' || value === 'normal' || value === 'hard';
}
