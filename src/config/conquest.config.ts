/**
 * Conquest mode (prototype, feature `conquest`, 2026-09-26; owner: "experiment
 * with how this game could go beyond just a 1 time play, with roguelite
 * elements or other options / other stage with higher difficulty").
 *
 * A run is five battles. Before each, pick one of two or three nodes: every
 * node is a battle with its own enemy (difficulty and AI profile), mutators
 * and reward. After a win, pick one of three relics (run-long bonuses). Lose
 * a battle and the run ends. Every win earns Glory, kept between runs and
 * spent in the Hall of Glory on permanent unlocks. Clearing a run unlocks
 * the next Ascension level (every enemy tougher).
 *
 * Everything is data here; `systems/experimental/ConquestSystem.ts` applies a
 * battle's setup through the normal rules (grants go through economyOps and
 * the usual `*-requested` events, stat changes through side modifiers).
 * All numbers PROPOSED.
 */
import type { AiDifficultyName } from '@config/ai.config';
import type { BuildingId, ResearchId } from '@config/buildings.config';
import type { ModifiableStat, Side } from '@state/types';

/** A change to a battle's starting position or rules for one side. */
export type ConquestEffect =
  | { kind: 'unit-stat'; side: Side | 'both'; stat: ModifiableStat; mult: number; slots?: readonly (1 | 2 | 3 | 4 | 5)[] }
  /** Gold at the start, times the start age's factor. */
  | { kind: 'gold'; side: Side | 'both'; amount: number }
  | { kind: 'xp'; side: Side | 'both'; amount: number }
  | { kind: 'start-age'; age: number }
  | { kind: 'building'; side: Side | 'both'; buildingId: BuildingId; levels: number }
  | { kind: 'research'; side: Side | 'both'; researchId: ResearchId; tiers: number }
  /** Unlocked slots and a turret of the start age's `turretKind` in each. */
  | { kind: 'turrets'; side: Side | 'both'; count: number; turretKind: 'rapid' | 'heavy' | 'area'; level: number }
  /** Multiplier on the enemy AI's own income. */
  | { kind: 'ai-income'; mult: number };

export interface Mutator {
  id: string;
  name: string;
  about: string;
  /** Harder mutators pay more Glory. */
  glory: number;
  effects: readonly ConquestEffect[];
}

export const MUTATORS: readonly Mutator[] = [
  { id: 'veterans', name: 'Veteran foes', about: 'Enemy units +25% HP', glory: 2, effects: [{ kind: 'unit-stat', side: 'enemy', stat: 'maxHp', mult: 1.25 }] },
  { id: 'fury', name: 'Fury', about: 'Enemy units +20% damage', glory: 2, effects: [{ kind: 'unit-stat', side: 'enemy', stat: 'damage', mult: 1.2 }] },
  {
    id: 'glass',
    name: 'Glass cannons',
    about: 'All units +30% damage, -25% HP',
    glory: 1,
    effects: [
      { kind: 'unit-stat', side: 'both', stat: 'damage', mult: 1.3 },
      { kind: 'unit-stat', side: 'both', stat: 'maxHp', mult: 0.75 },
    ],
  },
  { id: 'gold-rush', name: 'Gold rush', about: 'Both sides start with +400 gold', glory: 0, effects: [{ kind: 'gold', side: 'both', amount: 400 }] },
  {
    id: 'fortified',
    name: 'Fortified',
    about: 'The enemy starts with two upgraded turrets',
    glory: 2,
    effects: [{ kind: 'turrets', side: 'enemy', count: 2, turretKind: 'area', level: 1 }],
  },
  { id: 'swift', name: 'Swift armies', about: 'All units walk 25% faster', glory: 0, effects: [{ kind: 'unit-stat', side: 'both', stat: 'speed', mult: 1.25 }] },
  {
    id: 'war-economy',
    name: 'War economy',
    about: 'Enemy income x1.5',
    glory: 2,
    effects: [{ kind: 'ai-income', mult: 1.5 }],
  },
  {
    id: 'scholars',
    name: 'Enemy scholars',
    about: 'The enemy starts with a Forge and research',
    glory: 1,
    effects: [
      { kind: 'building', side: 'enemy', buildingId: 'forge', levels: 3 },
      { kind: 'research', side: 'enemy', researchId: 'meleeDamage', tiers: 1 },
      { kind: 'research', side: 'enemy', researchId: 'meleeArmor', tiers: 1 },
    ],
  },
];

export interface Relic {
  id: string;
  name: string;
  about: string;
  effects: readonly ConquestEffect[];
  /** Needs this Glory unlock before it can be offered. */
  unlock?: string;
}

export const RELICS: readonly Relic[] = [
  { id: 'whetstone', name: 'Whetstone', about: 'Your units +10% damage', effects: [{ kind: 'unit-stat', side: 'player', stat: 'damage', mult: 1.1 }] },
  { id: 'hides', name: 'Thick hides', about: 'Your units +12% HP', effects: [{ kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.12 }] },
  { id: 'war-chest', name: 'War chest', about: '+150 starting gold', effects: [{ kind: 'gold', side: 'player', amount: 150 }] },
  { id: 'prospector', name: "Prospector's map", about: 'Start with a Mine at level 3', effects: [{ kind: 'building', side: 'player', buildingId: 'mine', levels: 3 }] },
  { id: 'tomes', name: 'Old tomes', about: 'Start with a Library at level 2 and 80 XP', effects: [{ kind: 'building', side: 'player', buildingId: 'library', levels: 2 }, { kind: 'xp', side: 'player', amount: 80 }] },
  { id: 'anvil', name: 'Heirloom anvil', about: 'Start with a Forge at level 3', effects: [{ kind: 'building', side: 'player', buildingId: 'forge', levels: 3 }] },
  { id: 'watchtower', name: 'Watchtower', about: 'Start with a rapid turret, upgraded once', effects: [{ kind: 'turrets', side: 'player', count: 1, turretKind: 'rapid', level: 1 }] },
  { id: 'drums', name: 'War drums', about: 'Your units walk 12% faster', effects: [{ kind: 'unit-stat', side: 'player', stat: 'speed', mult: 1.12 }] },
  { id: 'longbows', name: 'Yew staves', about: 'Your ranged units +15% range', effects: [{ kind: 'unit-stat', side: 'player', stat: 'range', mult: 1.15, slots: [2] }] },
  { id: 'plate', name: 'Plate armor', about: 'Your melee and heavies take 10% less damage', effects: [{ kind: 'unit-stat', side: 'player', stat: 'damageTaken', mult: 0.9, slots: [1, 3] }] },
  {
    id: 'crown',
    name: 'Crown of kings',
    about: 'Your units +8% damage and +8% HP',
    unlock: 'royal-relics',
    effects: [
      { kind: 'unit-stat', side: 'player', stat: 'damage', mult: 1.08 },
      { kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.08 },
    ],
  },
  {
    id: 'grail',
    name: 'The grail',
    about: 'Your utility units +60% HP; +200 gold',
    unlock: 'royal-relics',
    effects: [
      { kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.6, slots: [5] },
      { kind: 'gold', side: 'player', amount: 200 },
    ],
  },
];

/** The battle types of a run, in order; each stage offers `choices` nodes. */
export interface StageSpec {
  name: string;
  choices: number;
  difficulties: readonly AiDifficultyName[];
  mutators: readonly [number, number];
  glory: number;
  /** Chance that a node starts in a later age (see `LATE_START`). */
  lateStart: number;
}

export const RUN_STAGES: readonly StageSpec[] = [
  { name: 'Skirmish', choices: 2, difficulties: ['easy'], mutators: [0, 1], glory: 3, lateStart: 0 },
  { name: 'Battle', choices: 3, difficulties: ['easy', 'normal'], mutators: [1, 1], glory: 4, lateStart: 0.2 },
  { name: 'Battle', choices: 3, difficulties: ['normal'], mutators: [1, 2], glory: 5, lateStart: 0.3 },
  { name: 'Elite', choices: 2, difficulties: ['normal', 'hard'], mutators: [2, 2], glory: 7, lateStart: 0.4 },
  { name: 'Warlord', choices: 1, difficulties: ['hard'], mutators: [2, 3], glory: 12, lateStart: 0.5 },
];

/**
 * A late-start node begins in a later age, both sides with extra gold (times
 * that age's factor): the Castle age in the first three stages, the
 * Renaissance after that.
 */
export const LATE_START = { gold: 300, glory: 1, ageByStage: [1, 1, 1, 2, 2] } as const;

/** Relic options after a win. */
export const RELIC_CHOICES = 3;

/**
 * Ascension (unlocked by clearing runs): each level makes every enemy +8% HP,
 * +6% damage and +10% AI income, on top of the node's own rules.
 */
export const ASCENSION = { maxLevel: 10, hpPerLevel: 0.08, damagePerLevel: 0.06, incomePerLevel: 0.1 } as const;

/** Glory for a win: the stage's, plus each mutator's, plus the ascension level; clearing a run adds `runBonus`. */
export const GLORY = { runBonus: 10 } as const;

/** Permanent unlocks bought with Glory in the Hall of Glory. */
export interface GloryUnlock {
  id: string;
  name: string;
  about: string;
  cost: number;
}

export const GLORY_UNLOCKS: readonly GloryUnlock[] = [
  { id: 'extra-choice', name: 'Quartermaster', about: 'Four relics to choose from after a win', cost: 20 },
  { id: 'reroll', name: 'Second opinion', about: 'Reroll the relic choice once per run', cost: 15 },
  { id: 'starting-relic', name: 'Family heirloom', about: 'Start every run with a random relic', cost: 30 },
  { id: 'deep-pockets', name: 'Deep pockets', about: '+100 gold at the start of every battle', cost: 25 },
  { id: 'royal-relics', name: 'Royal treasury', about: 'Adds the Crown and the Grail to the relic pool', cost: 40 },
];

/** The AI profiles enemies are drawn from (see aiGenome.config). */
export const CONQUEST_ENEMY_PROFILES: readonly string[] = ['classic', 'balanced', 'warlord', 'turtle', 'economist', 'tactician'];
