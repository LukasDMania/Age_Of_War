/**
 * Conquest mode (prototype, feature `conquest`). First built 2026-09-26 as a
 * five-battle run; reworked 2026-09-27 into a long campaign (owner: "flesh
 * out the roguelite idea more where it can really be a long term idea, not a
 * 1h run idea, more like a 10h game idea"; "we never get to the space age").
 *
 * A run marches through history: five chapters, one per age, from the Stone
 * age to the Future. Each chapter is a small map (three columns of three
 * nodes, then the chapter's boss): battles, elite battles, camps, events and
 * treasure. Battles are fought in the chapter's age and can't age up (the
 * campaign advances the ages between chapters). Banners are the run's lives:
 * a lost battle costs one. Supplies, earned in battle, buy upgrades at camps.
 * A commander, picked at the start, shapes the run.
 *
 * Between runs: Glory buys Legacy unlocks (a four-tier tree), achievements
 * unlock commanders, and clearing a run unlocks the next Ascension level.
 *
 * Everything here is data; `state/conquestState.ts` runs the campaign and
 * `systems/experimental/ConquestSystem.ts` applies a battle's setup through
 * the normal rules. All numbers PROPOSED.
 */
import type { AiDifficultyName } from '@config/ai.config';
import type { BuildingId, ResearchId } from '@config/buildings.config';
import type { ModifiableStat, Side } from '@state/types';

/* ---- Battle effects ------------------------------------------------------------ */

/** A change to a battle's starting position or rules for one side. */
export type ConquestEffect =
  | { kind: 'unit-stat'; side: Side | 'both'; stat: ModifiableStat; mult: number; slots?: readonly (1 | 2 | 3 | 4 | 5)[] }
  /** Gold at the start, times the battle's age factor. */
  | { kind: 'gold'; side: Side | 'both'; amount: number }
  | { kind: 'xp'; side: Side | 'both'; amount: number }
  | { kind: 'start-age'; age: number }
  | { kind: 'building'; side: Side | 'both'; buildingId: BuildingId; levels: number }
  | { kind: 'research'; side: Side | 'both'; researchId: ResearchId; tiers: number }
  /** Unlocked slots and a turret of the battle age's `turretKind` in each. */
  | { kind: 'turrets'; side: Side | 'both'; count: number; turretKind: 'rapid' | 'heavy' | 'area'; level: number }
  /** Free units of the battle's age in a slot, queued at the start. */
  | { kind: 'units'; side: Side | 'both'; slot: 1 | 2 | 3 | 4 | 5; count: number }
  /** Multiplier on the enemy AI's own income. */
  | { kind: 'ai-income'; mult: number }
  /** Multiplier on the gold a side gets for kills. */
  | { kind: 'kill-gold'; side: Side | 'both'; mult: number };

/* ---- Mutators (battlefield rules) -------------------------------------------------- */

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
  { id: 'gold-rush', name: 'Gold rush', about: 'Both sides start with +300 gold', glory: 0, effects: [{ kind: 'gold', side: 'both', amount: 300 }] },
  {
    id: 'fortified',
    name: 'Fortified',
    about: 'The enemy starts with two upgraded turrets',
    glory: 2,
    effects: [{ kind: 'turrets', side: 'enemy', count: 2, turretKind: 'area', level: 1 }],
  },
  { id: 'swift', name: 'Swift armies', about: 'All units walk 25% faster', glory: 0, effects: [{ kind: 'unit-stat', side: 'both', stat: 'speed', mult: 1.25 }] },
  { id: 'war-economy', name: 'War economy', about: 'Enemy income x1.5', glory: 2, effects: [{ kind: 'ai-income', mult: 1.5 }] },
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
  {
    id: 'vanguard',
    name: 'Vanguard',
    about: 'The enemy starts with three heavies on the way',
    glory: 2,
    effects: [{ kind: 'units', side: 'enemy', slot: 3, count: 3 }],
  },
  {
    id: 'sharpshooters',
    name: 'Sharpshooters',
    about: 'Enemy ranged units +25% range and damage',
    glory: 2,
    effects: [
      { kind: 'unit-stat', side: 'enemy', stat: 'range', mult: 1.25, slots: [2] },
      { kind: 'unit-stat', side: 'enemy', stat: 'damage', mult: 1.25, slots: [2] },
    ],
  },
  {
    id: 'iron-hide',
    name: 'Iron hides',
    about: 'Enemy heavies take 25% less damage',
    glory: 2,
    effects: [{ kind: 'unit-stat', side: 'enemy', stat: 'damageTaken', mult: 0.75, slots: [3] }],
  },
  {
    id: 'fog',
    name: 'Fog of war',
    about: 'All ranged units -25% range',
    glory: 1,
    effects: [{ kind: 'unit-stat', side: 'both', stat: 'range', mult: 0.75, slots: [2] }],
  },
];

/* ---- Relics (run-long bonuses) ------------------------------------------------------ */

export interface Relic {
  id: string;
  name: string;
  about: string;
  effects: readonly ConquestEffect[];
  /** Needs this Legacy unlock before it can be offered. */
  unlock?: string;
  /** Rare relics come only from elites, bosses and treasure. */
  rare?: boolean;
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
  { id: 'honed-edge', name: 'Honed edge', about: 'Your melee units +20% damage', effects: [{ kind: 'unit-stat', side: 'player', stat: 'damage', mult: 1.2, slots: [1] }] },
  { id: 'fletching', name: 'Fine fletching', about: 'Your ranged units attack 12% faster', effects: [{ kind: 'unit-stat', side: 'player', stat: 'attackCooldown', mult: 0.88, slots: [2] }] },
  { id: 'banner-guard', name: 'Banner guard', about: 'Start every battle with two melee units', effects: [{ kind: 'units', side: 'player', slot: 1, count: 2 }] },
  { id: 'ledger', name: "Merchant's ledger", about: 'Your money units +50% HP', effects: [{ kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.5, slots: [4] }] },
  { id: 'relic-shield', name: 'Ancestral shield', about: 'Your utility units +40% HP and effect strength', effects: [{ kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.4, slots: [5] }, { kind: 'unit-stat', side: 'player', stat: 'shield', mult: 1.4, slots: [5] }] },
  { id: 'siege-works', name: 'Siege works', about: 'Start with two heavy turrets', rare: true, effects: [{ kind: 'turrets', side: 'player', count: 2, turretKind: 'heavy', level: 0 }] },
  { id: 'war-college', name: 'War college', about: 'Start with melee and ranged damage research', rare: true, effects: [{ kind: 'building', side: 'player', buildingId: 'forge', levels: 1 }, { kind: 'research', side: 'player', researchId: 'meleeDamage', tiers: 1 }, { kind: 'research', side: 'player', researchId: 'rangedDamage', tiers: 1 }] },
  { id: 'beast-tamer', name: 'Beast tamer', about: 'Your heavies +25% HP', rare: true, effects: [{ kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.25, slots: [3] }] },
  {
    id: 'crown',
    name: 'Crown of kings',
    about: 'Your units +8% damage and +8% HP',
    unlock: 'royal-relics',
    rare: true,
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
    rare: true,
    effects: [
      { kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.6, slots: [5] },
      { kind: 'gold', side: 'player', amount: 200 },
    ],
  },
  {
    id: 'sunstone',
    name: 'Sunstone',
    about: 'Your units +15% damage, the enemy +10% income',
    unlock: 'royal-relics',
    rare: true,
    effects: [{ kind: 'unit-stat', side: 'player', stat: 'damage', mult: 1.15 }, { kind: 'ai-income', mult: 1.1 }],
  },
];

/* ---- The campaign map --------------------------------------------------------------- */

export type NodeType = 'battle' | 'elite' | 'boss' | 'camp' | 'treasure' | 'event';

export const NODE_INFO: Readonly<Record<NodeType, { name: string; about: string }>> = {
  battle: { name: 'Battle', about: 'A fight. Win supplies and Glory.' },
  elite: { name: 'Elite', about: 'A hard fight. Win a relic, supplies and more Glory.' },
  boss: { name: 'Warlord', about: "The chapter's boss. Win a relic, a banner back, and the next age." },
  camp: { name: 'Camp', about: 'Spend supplies on upgrades for the rest of the run, or rest to recover a banner.' },
  treasure: { name: 'Treasure', about: 'Take a relic, no fight.' },
  event: { name: 'Event', about: 'Something happens on the road. Choose wisely.' },
};

/** Rows and choice columns of a chapter map; the boss comes after the last column. */
export const MAP_ROWS = 3;
export const MAP_COLUMNS = 3;

/** How likely each node type is, per column (weights). */
export const COLUMN_WEIGHTS: readonly Readonly<Partial<Record<NodeType, number>>>[] = [
  { battle: 6, event: 2, treasure: 1 },
  { battle: 4, elite: 2, camp: 2, event: 2 },
  { battle: 3, elite: 3, camp: 3, treasure: 1, event: 1 },
];

export interface ChapterSpec {
  /** The age the chapter is fought in (battles are locked to it). */
  age: number;
  name: string;
  /** Extra starting gold for both sides (times the age factor). */
  startGold: number;
  battle: { difficulties: readonly AiDifficultyName[]; mutators: readonly [number, number] };
  elite: { difficulty: AiDifficultyName; mutators: readonly [number, number] };
}

export const CHAPTERS: readonly ChapterSpec[] = [
  { age: 0, name: 'Dawn of War', startGold: 60, battle: { difficulties: ['easy', 'normal'], mutators: [0, 1] }, elite: { difficulty: 'normal', mutators: [1, 2] } },
  { age: 1, name: 'Age of Castles', startGold: 150, battle: { difficulties: ['normal'], mutators: [0, 1] }, elite: { difficulty: 'hard', mutators: [1, 2] } },
  { age: 2, name: 'Powder and Sail', startGold: 150, battle: { difficulties: ['normal', 'hard'], mutators: [1, 1] }, elite: { difficulty: 'hard', mutators: [2, 2] } },
  { age: 3, name: 'The Great Wars', startGold: 150, battle: { difficulties: ['hard'], mutators: [1, 2] }, elite: { difficulty: 'hard', mutators: [2, 3] } },
  { age: 4, name: 'Among the Stars', startGold: 150, battle: { difficulties: ['hard'], mutators: [1, 2] }, elite: { difficulty: 'hard', mutators: [2, 3] } },
];

/** Each chapter's boss: a hard AI with its own rules. */
export interface Boss {
  name: string;
  title: string;
  about: string;
  profile: string;
  mutators: readonly string[];
  effects: readonly ConquestEffect[];
}

export const BOSSES: readonly Boss[] = [
  {
    name: 'Grok',
    title: 'the Mammoth King',
    about: 'Leads a herd of mammoths: his heavies +40% HP.',
    profile: 'warlord',
    mutators: ['vanguard'],
    effects: [{ kind: 'unit-stat', side: 'enemy', stat: 'maxHp', mult: 1.4, slots: [3] }],
  },
  {
    name: 'Baron Blackwall',
    title: 'of the Iron Keep',
    about: 'Hides behind walls of turrets and ballistas.',
    profile: 'turtle',
    mutators: ['fortified', 'scholars'],
    effects: [{ kind: 'turrets', side: 'enemy', count: 1, turretKind: 'heavy', level: 2 }],
  },
  {
    name: 'The Iron Admiral',
    title: 'Master of Powder',
    about: 'His musketeers never miss: ranged units +25% range and damage.',
    profile: 'tactician',
    mutators: ['sharpshooters', 'war-economy'],
    effects: [],
  },
  {
    name: 'General Kessler',
    title: 'the Steel Tide',
    about: 'Armored columns: heavies take 25% less damage, units +15% HP.',
    profile: 'raider',
    mutators: ['iron-hide', 'veterans'],
    effects: [{ kind: 'units', side: 'enemy', slot: 3, count: 2 }],
  },
  {
    name: 'The Overmind',
    title: 'at the End of Time',
    about: 'Everything it builds is better: units +20% HP and damage, income x1.5.',
    profile: 'trained',
    mutators: ['fury', 'veterans', 'war-economy'],
    effects: [{ kind: 'turrets', side: 'enemy', count: 2, turretKind: 'rapid', level: 2 }],
  },
];

/** Supplies and Glory per won node, by chapter index (0-4). */
export const NODE_REWARDS: Readonly<Record<'battle' | 'elite' | 'boss', (chapter: number) => { supplies: number; glory: number }>> = {
  battle: (c) => ({ supplies: 25 + 10 * c, glory: 2 + c }),
  elite: (c) => ({ supplies: 40 + 15 * c, glory: 4 + 2 * c }),
  boss: (c) => ({ supplies: 60 + 20 * c, glory: 8 + 3 * c }),
};

/** Extra supplies for a win with this much of the base left (0-1). */
export const BASE_BONUS_SUPPLIES = 20;

/** Relic options after an elite, a boss or a treasure node. */
export const RELIC_CHOICES = 3;

/* ---- Banners, camps ------------------------------------------------------------------ */

/** Banners (the run's lives) at the start of a run, and the most you can hold. */
export const BANNERS = { start: 3, max: 5 } as const;

export interface CampUpgrade {
  id: string;
  name: string;
  /** What one level gives. */
  about: string;
  maxLevel: number;
  /** Supplies for the next level: base + step x current level. */
  cost: { base: number; step: number };
  /** Applied once per level in every battle for the rest of the run. */
  effects: readonly ConquestEffect[];
}

export const CAMP_UPGRADES: readonly CampUpgrade[] = [
  { id: 'drill', name: 'Drill yard', about: 'Your units +6% HP', maxLevel: 5, cost: { base: 30, step: 20 }, effects: [{ kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.06 }] },
  { id: 'armory', name: 'Armory', about: 'Your units +6% damage', maxLevel: 5, cost: { base: 30, step: 20 }, effects: [{ kind: 'unit-stat', side: 'player', stat: 'damage', mult: 1.06 }] },
  { id: 'treasury', name: 'Treasury', about: '+100 starting gold', maxLevel: 5, cost: { base: 25, step: 15 }, effects: [{ kind: 'gold', side: 'player', amount: 100 }] },
  { id: 'masons', name: 'Masons', about: 'Start with one more rapid turret (upgraded once)', maxLevel: 2, cost: { base: 40, step: 40 }, effects: [{ kind: 'turrets', side: 'player', count: 1, turretKind: 'rapid', level: 1 }] },
  { id: 'surveyors', name: 'Surveyors', about: 'Start with the Mine 2 levels higher', maxLevel: 4, cost: { base: 30, step: 20 }, effects: [{ kind: 'building', side: 'player', buildingId: 'mine', levels: 2 }] },
  { id: 'smiths', name: 'Smithy', about: 'Start with the Forge 3 levels higher', maxLevel: 3, cost: { base: 35, step: 25 }, effects: [{ kind: 'building', side: 'player', buildingId: 'forge', levels: 3 }] },
  { id: 'recruits', name: 'Recruiting office', about: 'Start battles with one more free melee unit', maxLevel: 3, cost: { base: 30, step: 25 }, effects: [{ kind: 'units', side: 'player', slot: 1, count: 1 }] },
];

/** Resting at a camp: one banner back for this many supplies. */
export const CAMP_REST_COST = 40;

/* ---- Events -------------------------------------------------------------------------------- */

export interface EventOutcome {
  supplies?: number;
  banners?: number;
  glory?: number;
  /** A random relic. */
  relic?: boolean;
  /** Effects for the next battle only. */
  nextBattle?: readonly ConquestEffect[];
  /** Effects for every battle for the rest of the run. */
  runEffects?: readonly ConquestEffect[];
  text: string;
}

export interface EventOption {
  label: string;
  about: string;
  /** Supplies it costs (the option is greyed out without them). */
  cost?: number;
  /** A gamble: `win` with this chance, else `lose`. */
  chance?: number;
  win: EventOutcome;
  lose?: EventOutcome;
}

export interface ConquestEvent {
  id: string;
  title: string;
  text: string;
  options: readonly EventOption[];
}

export const EVENTS: readonly ConquestEvent[] = [
  {
    id: 'mercenaries',
    title: 'Sellswords',
    text: 'A band of mercenaries offers its blades for the next fight.',
    options: [
      { label: 'Hire them', about: '30 supplies: three free heavies next battle', cost: 30, win: { nextBattle: [{ kind: 'units', side: 'player', slot: 3, count: 3 }], text: 'The sellswords fall in behind your banner.' } },
      { label: 'Send them away', about: 'Nothing happens', win: { text: 'They shrug and ride off.' } },
    ],
  },
  {
    id: 'shrine',
    title: 'Forgotten shrine',
    text: 'An old shrine hums with strange power. Your soldiers whisper about curses.',
    options: [
      { label: 'Pray', about: '60%: a relic. 40%: lose a banner', chance: 0.6, win: { relic: true, text: 'A relic lies on the altar.' }, lose: { banners: -1, text: 'A cold wind tears one of your banners.' } },
      { label: 'Leave an offering', about: '20 supplies: +3 Glory', cost: 20, win: { glory: 3, text: 'The spirits remember your name.' } },
      { label: 'Walk on', about: 'Nothing happens', win: { text: 'You leave the shrine in peace.' } },
    ],
  },
  {
    id: 'caravan',
    title: 'Trade caravan',
    text: 'Merchants offer to trade supplies for coin.',
    options: [
      { label: 'Buy a war chest', about: '35 supplies: +250 starting gold for the rest of the run', cost: 35, win: { runEffects: [{ kind: 'gold', side: 'player', amount: 250 }], text: 'Your treasury grows.' } },
      { label: 'Sell spare kit', about: '+40 supplies, your units -5% HP next battle', win: { supplies: 40, nextBattle: [{ kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 0.95 }], text: 'The armor was worth more than you thought.' } },
      { label: 'Ignore them', about: 'Nothing happens', win: { text: 'The caravan rolls on.' } },
    ],
  },
  {
    id: 'deserters',
    title: 'Deserters',
    text: 'Enemy deserters beg to join you. They know the enemy camp.',
    options: [
      { label: 'Take them in', about: 'Two free ranged units every battle; -10 supplies now', cost: 10, win: { runEffects: [{ kind: 'units', side: 'player', slot: 2, count: 2 }], text: 'They know every path through the hills.' } },
      { label: 'Question them', about: '+25 supplies', win: { supplies: 25, text: 'They lead you to an enemy cache.' } },
    ],
  },
  {
    id: 'plague',
    title: 'Fever in the camp',
    text: 'A fever spreads through the ranks.',
    options: [
      { label: 'Burn the supplies', about: '-30 supplies, the fever stops', cost: 30, win: { text: 'The fever passes.' } },
      { label: 'March on', about: 'Your units -12% HP next battle', win: { nextBattle: [{ kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 0.88 }], text: 'Your soldiers march, pale and shaking.' } },
    ],
  },
  {
    id: 'blacksmith',
    title: 'Wandering smith',
    text: 'A master smith offers to work your steel.',
    options: [
      { label: 'Sharpen blades', about: '30 supplies: units +8% damage for the rest of the run', cost: 30, win: { runEffects: [{ kind: 'unit-stat', side: 'player', stat: 'damage', mult: 1.08 }], text: 'Every edge gleams.' } },
      { label: 'Mend armor', about: '30 supplies: units +8% HP for the rest of the run', cost: 30, win: { runEffects: [{ kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.08 }], text: 'Dents hammered out, straps replaced.' } },
      { label: 'No thanks', about: 'Nothing happens', win: { text: 'The smith moves on.' } },
    ],
  },
  {
    id: 'gamble',
    title: 'Dice by the fire',
    text: 'Your captains are gambling. One offers you a seat.',
    options: [
      { label: 'Play for supplies', about: '50%: +60 supplies. 50%: -30 supplies', chance: 0.5, win: { supplies: 60, text: 'Double sixes!' }, lose: { supplies: -30, text: 'The dice hate you tonight.' } },
      { label: 'Stay out of it', about: 'Nothing happens', win: { text: 'You sleep well.' } },
    ],
  },
  {
    id: 'ambush',
    title: 'Ambush!',
    text: 'Scouts spot an enemy ambush ahead.',
    options: [
      { label: 'Spring it', about: 'Next battle: the enemy starts with +2 heavies; +40 supplies', win: { supplies: 40, nextBattle: [{ kind: 'units', side: 'enemy', slot: 3, count: 2 }], text: 'You march straight into their trap, on purpose.' } },
      { label: 'Go around', about: '-15 supplies', cost: 15, win: { text: 'The long way costs you food, not blood.' } },
    ],
  },
  {
    id: 'banner-bearer',
    title: 'A veteran bearer',
    text: 'An old standard-bearer asks to carry your colors.',
    options: [
      { label: 'Give him a banner', about: '45 supplies: +1 banner', cost: 45, win: { banners: 1, text: 'Your colors fly higher.' } },
      { label: 'Decline', about: 'Nothing happens', win: { text: 'He salutes and leaves.' } },
    ],
  },
  {
    id: 'ruins',
    title: 'Ruins of an older age',
    text: 'Your engineers find the ruins of a fortress from an earlier age.',
    options: [
      { label: 'Salvage the stones', about: 'Start every battle with a heavy turret', win: { runEffects: [{ kind: 'turrets', side: 'player', count: 1, turretKind: 'heavy', level: 0 }], text: 'Old stones, new walls.' } },
      { label: 'Search the vaults', about: '50%: a relic. 50%: nothing', chance: 0.5, win: { relic: true, text: 'Something glitters in the dark.' }, lose: { text: 'Dust and bones.' } },
    ],
  },
];

/* ---- Commanders ------------------------------------------------------------------------- */

export interface Commander {
  id: string;
  name: string;
  about: string;
  effects: readonly ConquestEffect[];
  /** Extra banners at the start of a run. */
  banners?: number;
  /** Supplies earned x this. */
  suppliesMult?: number;
  /** Unlocked by this achievement (none: available from the start). */
  unlock?: string;
}

export const COMMANDERS: readonly Commander[] = [
  { id: 'chieftain', name: 'The Chieftain', about: 'A steady hand. No strengths, no weaknesses.', effects: [] },
  {
    id: 'warlord',
    name: 'The Warlord',
    about: 'Units +15% damage, -10% HP. Bosses fear him.',
    unlock: 'boss-slayer',
    effects: [
      { kind: 'unit-stat', side: 'player', stat: 'damage', mult: 1.15 },
      { kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 0.9 },
    ],
  },
  {
    id: 'castellan',
    name: 'The Castellan',
    about: 'Starts every battle with two turrets; units -8% damage.',
    unlock: 'renaissance',
    effects: [
      { kind: 'turrets', side: 'player', count: 2, turretKind: 'rapid', level: 1 },
      { kind: 'unit-stat', side: 'player', stat: 'damage', mult: 0.92 },
    ],
  },
  {
    id: 'merchant',
    name: 'The Merchant Prince',
    about: '+300 starting gold and a Mine at level 5; supplies x1.25; units -8% HP.',
    unlock: 'hoarder',
    suppliesMult: 1.25,
    effects: [
      { kind: 'gold', side: 'player', amount: 300 },
      { kind: 'building', side: 'player', buildingId: 'mine', levels: 5 },
      { kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 0.92 },
    ],
  },
  {
    id: 'sage',
    name: 'The Sage',
    about: 'Starts every battle with a Forge at level 6 and two research tiers.',
    unlock: 'stargazer',
    effects: [
      { kind: 'building', side: 'player', buildingId: 'forge', levels: 6 },
      { kind: 'research', side: 'player', researchId: 'rangedDamage', tiers: 2 },
      { kind: 'research', side: 'player', researchId: 'meleeArmor', tiers: 1 },
    ],
  },
  {
    id: 'survivor',
    name: 'The Survivor',
    about: '+2 banners; supplies x0.8.',
    unlock: 'hard-lessons',
    banners: 2,
    suppliesMult: 0.8,
    effects: [],
  },
  {
    id: 'conqueror',
    name: 'The Conqueror',
    about: 'Units +10% damage and HP, but every enemy +15% HP. For veterans.',
    unlock: 'conqueror',
    effects: [
      { kind: 'unit-stat', side: 'player', stat: 'damage', mult: 1.1 },
      { kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.1 },
      { kind: 'unit-stat', side: 'enemy', stat: 'maxHp', mult: 1.15 },
    ],
  },
];

/* ---- Achievements --------------------------------------------------------------------------- */

/** Lifetime counters kept in the meta state. */
export interface ConquestStats {
  battlesWon: number;
  elitesWon: number;
  bossesWon: number;
  /** Highest chapter reached (1-5). */
  maxChapter: number;
  runsWon: number;
  runsLost: number;
  /** Most relics held at once in a run. */
  maxRelics: number;
  eventsSeen: number;
}

export interface Achievement {
  id: string;
  name: string;
  about: string;
  stat: keyof ConquestStats;
  atLeast: number;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-blood', name: 'First blood', about: 'Win a battle', stat: 'battlesWon', atLeast: 1 },
  { id: 'veteran', name: 'Veteran', about: 'Win 25 battles', stat: 'battlesWon', atLeast: 25 },
  { id: 'boss-slayer', name: 'Boss slayer', about: 'Defeat 3 warlords (unlocks the Warlord)', stat: 'bossesWon', atLeast: 3 },
  { id: 'renaissance', name: 'Into the Renaissance', about: 'Reach chapter 3 (unlocks the Castellan)', stat: 'maxChapter', atLeast: 3 },
  { id: 'hoarder', name: 'Hoarder', about: 'Hold 6 relics in one run (unlocks the Merchant Prince)', stat: 'maxRelics', atLeast: 6 },
  { id: 'stargazer', name: 'Stargazer', about: 'Reach chapter 5, the Future (unlocks the Sage)', stat: 'maxChapter', atLeast: 5 },
  { id: 'hard-lessons', name: 'Hard lessons', about: 'Lose 3 runs (unlocks the Survivor)', stat: 'runsLost', atLeast: 3 },
  { id: 'elite-hunter', name: 'Elite hunter', about: 'Win 10 elite battles', stat: 'elitesWon', atLeast: 10 },
  { id: 'wanderer', name: 'Wanderer', about: 'See 15 events', stat: 'eventsSeen', atLeast: 15 },
  { id: 'conqueror', name: 'Conqueror', about: 'Win a whole run (unlocks the Conqueror)', stat: 'runsWon', atLeast: 1 },
  { id: 'legend', name: 'Legend', about: 'Win 5 runs', stat: 'runsWon', atLeast: 5 },
];

/* ---- Legacy (permanent unlocks, bought with Glory) ---------------------------------------- */

/** Run-wide knobs a Legacy unlock can turn. Numbers add up across unlocks. */
export interface RunPerks {
  banners?: number;
  /** Supplies at the start of a run. */
  supplies?: number;
  /** Supplies earned x (1 + this). */
  suppliesBonus?: number;
  relicChoices?: number;
  /** Relic rerolls per run. */
  rerolls?: number;
  startingRelic?: boolean;
  /** Camp upgrades cost this share less. */
  campDiscount?: number;
  /** Glory earned x (1 + this). */
  gloryBonus?: number;
}

export interface LegacyUnlock {
  id: string;
  name: string;
  about: string;
  cost: number;
  tier: 1 | 2 | 3 | 4;
  /** Applied in every battle. */
  battle?: readonly ConquestEffect[];
  run?: RunPerks;
}

/** Unlocks needed in total before a tier opens. */
export const LEGACY_TIER_REQUIRES: Readonly<Record<1 | 2 | 3 | 4, number>> = { 1: 0, 2: 3, 3: 7, 4: 12 };

export const LEGACY: readonly LegacyUnlock[] = [
  // Tier 1
  { id: 'deep-pockets', name: 'Deep pockets', about: '+100 starting gold every battle', cost: 15, tier: 1, battle: [{ kind: 'gold', side: 'player', amount: 100 }] },
  { id: 'reroll', name: 'Second opinion', about: 'Reroll a relic choice once per run', cost: 15, tier: 1, run: { rerolls: 1 } },
  { id: 'supply-lines', name: 'Supply lines', about: 'Start runs with 40 supplies', cost: 20, tier: 1, run: { supplies: 40 } },
  { id: 'extra-choice', name: 'Quartermaster', about: 'Four relics to choose from', cost: 25, tier: 1, run: { relicChoices: 1 } },
  { id: 'drillmasters', name: 'Drillmasters', about: 'Your units +5% HP in every battle', cost: 25, tier: 1, battle: [{ kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.05 }] },
  // Tier 2
  { id: 'field-medic', name: 'Field hospital', about: '+1 banner', cost: 40, tier: 2, run: { banners: 1 } },
  { id: 'starting-relic', name: 'Family heirloom', about: 'Start every run with a random relic', cost: 40, tier: 2, run: { startingRelic: true } },
  { id: 'foragers', name: 'Foragers', about: 'Supplies +20%', cost: 45, tier: 2, run: { suppliesBonus: 0.2 } },
  { id: 'old-guard', name: 'Old guard', about: 'Start every battle with a free melee unit', cost: 45, tier: 2, battle: [{ kind: 'units', side: 'player', slot: 1, count: 1 }] },
  { id: 'royal-relics', name: 'Royal treasury', about: 'Adds the Crown, the Grail and the Sunstone to the relic pool', cost: 50, tier: 2 },
  // Tier 3
  { id: 'bargainers', name: 'Bargainers', about: 'Camp upgrades 25% cheaper', cost: 70, tier: 3, run: { campDiscount: 0.25 } },
  { id: 'war-academy', name: 'War academy', about: 'Your units +5% damage in every battle', cost: 80, tier: 3, battle: [{ kind: 'unit-stat', side: 'player', stat: 'damage', mult: 1.05 }] },
  { id: 'fame', name: 'Fame', about: 'Glory +25%', cost: 80, tier: 3, run: { gloryBonus: 0.25 } },
  { id: 'second-reroll', name: 'Scholars of war', about: 'One more relic reroll per run', cost: 60, tier: 3, run: { rerolls: 1 } },
  // Tier 4
  { id: 'ancestral-banner', name: 'Ancestral banner', about: '+1 banner', cost: 120, tier: 4, run: { banners: 1 } },
  { id: 'master-builders', name: 'Master builders', about: 'Start every battle with a Mine and a Forge at level 3', cost: 120, tier: 4, battle: [{ kind: 'building', side: 'player', buildingId: 'mine', levels: 3 }, { kind: 'building', side: 'player', buildingId: 'forge', levels: 3 }] },
  { id: 'legend-status', name: 'Living legend', about: 'Your units +8% damage and HP in every battle', cost: 160, tier: 4, battle: [{ kind: 'unit-stat', side: 'player', stat: 'damage', mult: 1.08 }, { kind: 'unit-stat', side: 'player', stat: 'maxHp', mult: 1.08 }] },
];

/* ---- Battle economy -------------------------------------------------------------------------- */

/**
 * Every Conquest battle's economy (2026-09-27, owner: "i can never win,
 * always lose in the time out damage").
 *
 * The AI's own income (`AI_INCOME`, easy 1 / normal 1.5 / hard 2.5) is made
 * for skirmish, where the player can out-age it. Conquest battles are locked
 * to one age, so it was pure extra money: in the owner's five chapter-1
 * battles it paid the AI 2-5 gold/s against a Mine of about 1, the AI
 * out-earned the player in all five although the player out-killed it
 * (74-43, 105-21, 92-51, 35-16, 88-53), the AI's base was untouched when
 * the siege guns started, and the siege finished the player's base. The
 * earlier simulated runs missed it: an AI on the player's side gets that
 * income too, a human doesn't (`playerAiIncome: false` plays it like a
 * human now).
 *
 * Measured (a hard player AI without the income, 24 battles per row, no
 * mutators or relics; the siege ends every battle, so the AI can't be
 * starved into a stall): before, it won 8 / 0 / 0% of Stone-age battles
 * against easy / normal / hard and 0-4% in later ages. With `aiIncome` 0.1
 * and `playerKillGold` 1.5: 75-92 / 83 / 63-71% in the Stone age, 63-88%
 * in later ages, about 40% against Grok and the Iron Admiral. Kill gold
 * alone (x2, AI income unchanged) fixed easy and normal battles but left
 * hard ones (every elite and boss, chapters 4-5) at 17-42%.
 *
 * Mutators, relics and ascension still multiply on top. PROPOSED.
 */
export const BATTLE_ECONOMY = {
  /** The enemy AI's own income x this (`ai-income`). */
  aiIncome: 0.1,
  /** The player's kill gold x this (`kill-gold`). */
  playerKillGold: 1.5,
} as const;

/* ---- Siege --------------------------------------------------------------------------------- */

/**
 * Siege (2026-09-27): battles are locked to one age, so nothing breaks a
 * stalemate the way an age-up does (AI-vs-AI chapter battles stalled for 20
 * minutes). From `startMs` on, every unit of both sides deals `perMinute`
 * more damage each minute (at most `maxMult`); turrets don't grow. From
 * `wallsFromMs`, siege guns hit both bases every `wallsEveryMs`: in the
 * first minute `wallsFirst` of their max HP per minute, `wallsGrowth` more
 * each minute after, so a battle ends by about minute 15 and the side that
 * kept its base in better shape wins a stalemate.
 */
export const SIEGE = {
  startMs: 5 * 60_000,
  perMinute: 0.2,
  maxMult: 3,
  wallsFromMs: 8 * 60_000,
  wallsEveryMs: 4000,
  wallsFirst: 0.04,
  wallsGrowth: 0.04,
} as const;

/* ---- Ascension ---------------------------------------------------------------------------- */

/**
 * Ascension (unlocked by clearing runs): each level makes every enemy +8%
 * HP, +6% damage and +10% AI income, and every win pays +1 Glory per level.
 */
export const ASCENSION = { maxLevel: 10, hpPerLevel: 0.08, damagePerLevel: 0.06, incomePerLevel: 0.1 } as const;

/** Glory for clearing a whole run, and for each chapter cleared on a run that ends early. */
export const GLORY = { runBonus: 25, perChapter: 3 } as const;

/** The AI profiles enemies are drawn from (see aiGenome.config). Trained profiles join from chapter 3. */
export const CONQUEST_ENEMY_PROFILES: readonly string[] = ['classic', 'balanced', 'warlord', 'turtle', 'economist', 'tactician'];
