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
  /**
   * Building levels it buys per age tier (Phase 14; since 2026-09-26 there
   * are five levels per age, so this is 0-5 of each age's five).
   */
  buildingLevelCap: number;
  /** Highest Forge research tier it buys (Phase 14); 0 = no research. */
  researchTierCap: number;
  /**
   * Multiplier on the AI's own income (Phase 15, see `AI_INCOME`): gold and
   * XP it gets on top of kills and buildings, so it can't be starved.
   */
  incomeMult: number;
  /** How the AI eases into a match (owner, 2026-09-26: too much, too soon). */
  opening: AiOpening;
}

/**
 * The AI's opening (owner, 2026-09-26: "they have a mammoth and a bunch of
 * clubbers in the first minute, slow that down, more gradually going up").
 * The hard AI used to field six units in the first ten seconds and eleven
 * plus a mammoth by the one-minute mark, against a player with 100 gold.
 *
 * - Its own income starts at `incomeStartMult` of the normal rate and eases
 *   (smoothstep) up to the full rate at `incomeRampMs`.
 * - It keeps at most `armyCapStart` fighters (alive + queued), growing by
 *   `armyCapPerMin` per minute, until `endsAtMs`; with enemies at its gate
 *   it may go `threatBonus` over.
 * - No heavy units (slot 3) before `heavyAfterMs`.
 * - Queue depth 1 until the opening ends.
 * - The special is only fired in defence (enemies near its base) before
 *   `specialAfterMs` (the hard AI used to wipe the player's first wave at
 *   about 19 s).
 * PROPOSED numbers.
 */
export interface AiOpening {
  incomeStartMult: number;
  incomeRampMs: number;
  armyCapStart: number;
  armyCapPerMin: number;
  threatBonus: number;
  heavyAfterMs: number;
  specialAfterMs: number;
  endsAtMs: number;
}

const smoothstep = (x: number): number => {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
};

/** Multiplier on the AI's own income at a moment of the match (1 once warmed up). */
export function openingIncomeMult(opening: AiOpening, nowMs: number): number {
  return opening.incomeStartMult + (1 - opening.incomeStartMult) * smoothstep(nowMs / opening.incomeRampMs);
}

/** Most fighters the AI keeps (alive + queued) at a moment, or Infinity after the opening. */
export function openingArmyCap(opening: AiOpening, nowMs: number, threatened: boolean): number {
  if (nowMs >= opening.endsAtMs) return Infinity;
  const cap = Math.floor(opening.armyCapStart + (opening.armyCapPerMin * nowMs) / 60000);
  return cap + (threatened ? opening.threatBonus : 0);
}

/**
 * The AI's own income (owner chose "option C", 2026-09-26): every AI-played
 * side earns gold and XP per second no matter what happens on the lane, so
 * it can never be starved into a softlock. Rate = base x the side's age
 * factor x (1 + time ramp) x the difficulty's `incomeMult`. The ramp grows
 * linearly to `rampMax` at `rampFullAtMs`. PROPOSED numbers.
 */
/**
 * How much the AI favors each fighter slot (owner, 2026-09-26: mostly cheap
 * melee, some ranged, fewer heavies; roughly 50 / 33 / 17 %). Multiplies
 * the counter weights in `AIController.counterSlot`; easy picks at random
 * with these weights. PROPOSED.
 */
export const AI_UNIT_MIX: Readonly<Record<1 | 2 | 3, number>> = { 1: 1, 2: 0.65, 3: 0.33 };

export const AI_INCOME = {
  goldPerSec: 2,
  // Was 0.5 (Phase 15 first pass): AIs reached the Future age in ~8 min.
  xpPerSec: 0.25,
  rampMax: 1,
  rampFullAtMs: 30 * 60 * 1000,
} as const;

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
    incomeMult: 1,
    opening: {
      incomeStartMult: 0.2,
      incomeRampMs: 300000,
      armyCapStart: 2,
      armyCapPerMin: 2,
      threatBonus: 1,
      heavyAfterMs: 150000,
      specialAfterMs: 150000,
      endsAtMs: 300000,
    },
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
    incomeMult: 1.5,
    opening: {
      incomeStartMult: 0.25,
      incomeRampMs: 240000,
      armyCapStart: 2,
      armyCapPerMin: 2.5,
      threatBonus: 2,
      heavyAfterMs: 100000,
      specialAfterMs: 100000,
      endsAtMs: 240000,
    },
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
    incomeMult: 2.5,
    opening: {
      incomeStartMult: 0.3,
      incomeRampMs: 180000,
      armyCapStart: 3,
      armyCapPerMin: 3,
      threatBonus: 2,
      heavyAfterMs: 70000,
      specialAfterMs: 60000,
      endsAtMs: 200000,
    },
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

/** Highest building level an AI of this difficulty takes a building to in an age. */
export function aiBuildingCap(difficulty: AiDifficulty, age: number): number {
  return age * 5 + difficulty.buildingLevelCap;
}

export function isAiDifficultyName(value: unknown): value is AiDifficultyName {
  return value === 'easy' || value === 'normal' || value === 'hard';
}
