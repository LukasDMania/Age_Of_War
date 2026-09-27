/**
 * The Mech workshop (owner, 2026-09-27): a player-only unit you build
 * yourself from five parts: legs, torso, head, left arm and right arm. Each
 * arm is one weapon or tool, so two arms mean dual wielding, a melee arm
 * with a gun, a shield and a blade, and so on. Very strong but not an
 * instant win, expensive, a way to break stalemates. Building one is open
 * from the start; the advanced parts need a Forge level. Every part comes
 * in five versions, one per age, that look different (`art/mechDraw.ts`).
 *
 * Numbers are Stone-age values; a Mech built in a later age scales cost, HP
 * and damage by that age's factor like every unit. `entities/mechDesign.ts`
 * turns a design into a unit definition. All numbers PROPOSED (first draft,
 * owner: "I'll leave ur creativity for the first draft").
 */

export type MechSlot = 'legs' | 'torso' | 'head' | 'left' | 'right';

/** Slot order in the Workshop (and the slot keys 1-5). */
export const MECH_SLOTS: readonly MechSlot[] = ['legs', 'torso', 'head', 'left', 'right'];

export const MECH_SLOT_NAMES: Readonly<Record<MechSlot, string>> = {
  legs: 'Legs',
  torso: 'Torso',
  head: 'Head',
  left: 'Left arm',
  right: 'Right arm',
};

export type LegsId = 'walker' | 'treads' | 'stompers';
export type TorsoId = 'frame' | 'hull' | 'reactor';
export type HeadId = 'visor' | 'crest' | 'beacon';
export type ArmId = 'fist' | 'blade' | 'launcher' | 'shield' | 'drill';

export interface MechDesign {
  legs: LegsId;
  torso: TorsoId;
  head: HeadId;
  left: ArmId;
  right: ArmId;
}

/** What every part has. */
interface PartBase {
  name: string;
  /** One line for the Workshop card. */
  about: string;
  /** 1 light, 2 standard, 3 advanced: the cost multiplier grows with the design's total. */
  tier: 1 | 2 | 3;
  /** Stone-age gold. */
  cost: number;
  /** Extra HP (Stone age). */
  hp?: number;
  /** Damage taken x this (armor). */
  armor?: number;
  /** Needs this Forge level ("unlocked beyond the standard parts"). */
  forge?: number;
}

export interface LegsPart extends PartBase {
  /** Melee arms' damage x this (heavy stomping legs). */
  meleeDamage?: number;
}

export interface TorsoPart extends PartBase {
  /** Every arm's damage x this, and its cooldown x `cooldown`. */
  damage?: number;
  cooldown?: number;
}

export interface HeadPart extends PartBase {
  /** Ranged arms: reach and damage x these. */
  rangedRange?: number;
  rangedDamage?: number;
  /** An aura, as a unit's utility effect (Stone-age numbers). */
  aura?: { kind: 'buff'; radius: number; damageMult: number } | { kind: 'heal'; radius: number; amount: number; intervalMs: number };
}

export interface ArmPart extends PartBase {
  /** The arm's weapon; none for a shield. `ranged` fires the age's shell. */
  attack?: { damage: number; range: number; cooldownMs: number; splashRadius?: number; ranged?: boolean; baseDamageMult?: number };
}

export const MECH_LEGS: Readonly<Record<LegsId, LegsPart>> = {
  walker: { name: 'Walker', about: '+300 HP', tier: 1, cost: 75, hp: 300 },
  treads: { name: 'Treads', about: '+800 HP, armor', tier: 2, cost: 165, hp: 800, armor: 0.9 },
  stompers: { name: 'Stompers', about: '+500 HP, melee +30%', tier: 3, cost: 240, hp: 500, meleeDamage: 1.3, forge: 6 },
};

export const MECH_TORSOS: Readonly<Record<TorsoId, TorsoPart>> = {
  frame: { name: 'Frame', about: '+500 HP', tier: 1, cost: 90, hp: 500 },
  hull: { name: 'Armored hull', about: '+1100 HP, armor', tier: 2, cost: 210, hp: 1100, armor: 0.9 },
  reactor: { name: 'Reactor', about: '+700 HP, weapons +35% and faster', tier: 3, cost: 300, hp: 700, damage: 1.35, cooldown: 0.85, forge: 6 },
};

export const MECH_HEADS: Readonly<Record<HeadId, HeadPart>> = {
  visor: { name: 'Visor', about: 'Guns reach +25%, +10% damage', tier: 1, cost: 45, rangedRange: 1.25, rangedDamage: 1.1 },
  crest: { name: 'Command crest', about: 'Allies nearby +15% damage', tier: 2, cost: 120, aura: { kind: 'buff', radius: 180, damageMult: 1.15 } },
  beacon: { name: 'Repair beacon', about: 'Heals itself and allies nearby', tier: 3, cost: 195, aura: { kind: 'heal', radius: 160, amount: 15, intervalMs: 1500 }, forge: 11 },
};

export const MECH_ARMS: Readonly<Record<ArmId, ArmPart>> = {
  fist: { name: 'Fist', about: 'Heavy blows that splash', tier: 1, cost: 90, attack: { damage: 26, range: 12, cooldownMs: 1400, splashRadius: 24 } },
  blade: { name: 'Blade', about: 'Fast cuts', tier: 2, cost: 150, attack: { damage: 22, range: 14, cooldownMs: 800 } },
  launcher: { name: 'Launcher', about: 'Shells that splash, fires on the move', tier: 2, cost: 165, attack: { damage: 28, range: 160, cooldownMs: 1800, splashRadius: 20, ranged: true } },
  shield: { name: 'Shield', about: '+500 HP, armor, no weapon', tier: 1, cost: 90, hp: 500, armor: 0.9 },
  drill: { name: 'Siege drill', about: 'Bores through walls: x3 vs bases', tier: 3, cost: 225, attack: { damage: 30, range: 12, cooldownMs: 1300, baseDamageMult: 3 }, forge: 6 },
};

/** The options of each slot, in Workshop order. */
export const MECH_OPTIONS: Readonly<Record<MechSlot, readonly string[]>> = {
  legs: Object.keys(MECH_LEGS),
  torso: Object.keys(MECH_TORSOS),
  head: Object.keys(MECH_HEADS),
  left: Object.keys(MECH_ARMS),
  right: Object.keys(MECH_ARMS),
};

/** A design to start from. */
export const DEFAULT_MECH_DESIGN: MechDesign = { legs: 'walker', torso: 'frame', head: 'visor', left: 'fist', right: 'launcher' };

/**
 * The Mech's own numbers:
 * - `coreHp`: HP before parts (Stone age).
 * - Cost: the parts' prices x (1 + `tierCost` x (total tier - 5)): a light
 *   Mech is affordable early, a maxed one is the late-game gold sink (the
 *   Kessler stalemate sat on 5-34k gold with nothing to buy).
 * - Build time: `buildMs` + `buildPerTierMs` per tier above 5, at the
 *   Workshop, beside the unit queue. One Mech alive (or building) at a time.
 * - Kill rewards like other units: `killGold` and `killXp` x its cost.
 * - `attackRate`: frames/s of its attack strip (the strike lands at 45%).
 */
export const MECH = {
  coreHp: 400,
  tierCost: 0.12,
  buildMs: 15_000,
  buildPerTierMs: 2_500,
  killGold: 1.2,
  killXp: 0.4,
  attackRate: 14,
  /** Footprint on the lane, px: two units wide, twice a heavy's height. */
  bodyWidth: 64,
  bodyHeight: 112,
  spriteKey: 'unit-player-mech',
  /** Only the player builds Mechs (owner: a player-only unit). */
  sides: ['player'],
} as const;

/** Every unit id of a Mech starts with this (`entities/mechDesign.ts`). */
export const MECH_ID_PREFIX = 'mech:';
