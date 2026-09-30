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

/** The body slots (always filled) plus the optional Special module (Mech expansion). */
export type MechSlot = 'legs' | 'torso' | 'head' | 'left' | 'right' | 'module';
export type BodySlot = Exclude<MechSlot, 'module'>;

/** Slot order in the hangar (and the slot keys 1-6). */
export const MECH_SLOTS: readonly MechSlot[] = ['legs', 'torso', 'head', 'left', 'right', 'module'];
/** The five body slots: the cost and build time formulas count tiers above these. */
export const MECH_BODY_SLOTS: readonly BodySlot[] = ['legs', 'torso', 'head', 'left', 'right'];

export const MECH_SLOT_NAMES: Readonly<Record<MechSlot, string>> = {
  legs: 'Legs',
  torso: 'Torso',
  head: 'Head',
  left: 'Left arm',
  right: 'Right arm',
  module: 'Module',
};

export type LegsId = 'walker' | 'treads' | 'striders' | 'stompers' | 'hover' | 'spider' | 'jump';
export type TorsoId = 'frame' | 'hull' | 'armory' | 'reactor' | 'bay' | 'overcharge' | 'carrier';
export type HeadId = 'visor' | 'crest' | 'siren' | 'beacon' | 'scope' | 'taunt' | 'salvage';
export type ArmId =
  | 'fist'
  | 'blade'
  | 'launcher'
  | 'shield'
  | 'drill'
  | 'flamer'
  | 'minigun'
  | 'tesla'
  | 'railgun'
  | 'grapple'
  | 'wrecker';
/** `none`: the module slot left empty (saves gold). */
export type ModuleId = 'none' | 'smoke' | 'overdrive' | 'leap' | 'overload' | 'dome' | 'emp' | 'orbital';

export interface MechDesign {
  legs: LegsId;
  torso: TorsoId;
  head: HeadId;
  left: ArmId;
  right: ArmId;
  module: ModuleId;
}

/** Achievements that unlock parts (Mech expansion section 5). */
export type MechAchievementId = 'twin-guns-win' | 'launcher-siege' | 'mech-rampage' | 'mech-absorb' | 'mech-hunter' | 'big-army';

/**
 * How a part is opened across games (Mech expansion section 5): `base` from
 * the start, `level` at an account level, `achievement` by doing something.
 * Forge levels (`forge`) still lock parts within a match on top of this.
 */
export type PartUnlock = { kind: 'base' } | { kind: 'level'; level: number } | { kind: 'achievement'; id: MechAchievementId };

/** Set tags for set bonuses (Mech expansion section 3). */
export type MechSetId = 'bastion' | 'assault' | 'arsenal' | 'energy' | 'command' | 'scrapper';

/** What every part has. */
interface PartBase {
  name: string;
  /** One line for the hangar. */
  about: string;
  /** 0 none (an empty module), 1 light, 2 standard, 3 advanced: the cost multiplier grows with the design's total. */
  tier: 0 | 1 | 2 | 3;
  /** Stone-age gold. */
  cost: number;
  /** Extra HP (Stone age). */
  hp?: number;
  /** Damage taken x this (armor). */
  armor?: number;
  /** Needs this Forge level ("unlocked beyond the standard parts"). */
  forge?: number;
  /** Account unlock (default: base). */
  unlock?: PartUnlock;
  /** Set bonus tag. */
  set?: MechSetId;
}

export interface LegsPart extends PartBase {
  /** Melee arms' damage x this (heavy stomping legs). */
  meleeDamage?: number;
  /** Walking speed x this (the Mech alone; other units share one pace). */
  speed?: number;
  /** Slows and stuns from enemies don't take. */
  slowImmune?: boolean;
  /** Can't be knocked back or pulled. */
  knockbackImmune?: boolean;
  /** Guns reach x this. */
  rangedRange?: number;
  /** Leaps over the enemy front line while fighting, on a cooldown, landing with splash. */
  leap?: { cooldownMs: number; damage: number; radius: number };
}

export interface TorsoPart extends PartBase {
  /** Every arm's damage x this, and its cooldown x `cooldown`. */
  damage?: number;
  cooldown?: number;
  /** Ranged arms only: cooldown x this. */
  rangedCooldown?: number;
  /** Launches a drone at an enemy in `range` on a cooldown; it bursts with splash. */
  drones?: { cooldownMs: number; damage: number; radius: number; range: number };
  /** Loses this share of max HP per second, never below `floor` of it. */
  drain?: { perSec: number; floor: number };
  /** Carries melee units of the Mech's age; drops them when it first stops to fight, or falls. */
  troops?: number;
}

export interface HeadPart extends PartBase {
  /** Ranged arms: reach and damage x these. */
  rangedRange?: number;
  rangedDamage?: number;
  /** Gun arms fire at the back-most enemy in reach, over the front line. */
  targetBack?: boolean;
  /** Enemy units this close that can reach the Mech must attack it. */
  taunt?: { radius: number };
  /** Enemies killed this close to the Mech pay `goldMult` extra of their kill gold. */
  salvage?: { radius: number; goldMult: number };
  /** An aura, as a unit's utility effect (Stone-age numbers). */
  aura?:
    | { kind: 'buff'; radius: number; damageMult: number }
    | { kind: 'heal'; radius: number; amount: number; intervalMs: number }
    | { kind: 'slow'; range: number; mult: number; durationMs: number };
}

/** An arm's weapon (Stone-age damage). One of the special behaviors at most. */
export interface ArmAttack {
  damage: number;
  range: number;
  cooldownMs: number;
  splashRadius?: number;
  /** Fires a projectile of `MECH_PROJECTILES[kind]` (default `shell`). */
  ranged?: boolean;
  projectile?: MechProjectileKind;
  baseDamageMult?: number;
  /** Flames: everything up to this far past the target is hit too, and burns. */
  cone?: number;
  /** Damage per second for `durationMs` after a hit (Stone age). */
  burn?: { dps: number; durationMs: number };
  /** Fires faster the longer it keeps firing: `fastCooldownMs` after `rampMs`. */
  spinUp?: { fastCooldownMs: number; rampMs: number };
  /** Lightning jumps to `jumps` more enemies within `reach` px, x `falloff` damage each jump. */
  chain?: { jumps: number; reach: number; falloff: number };
  /** The shot flies through every unit in its way. */
  pierce?: boolean;
  /** Hooks the back-most enemy in reach and pulls it to the Mech. */
  pull?: boolean;
  /** Knocks the target back this many px. */
  knockback?: number;
}

export interface ArmPart extends PartBase {
  /** The arm's weapon; none for a shield. */
  attack?: ArmAttack;
}

/** A module's active ability (Stone-age damage and shields; cooldowns in ms). */
export type MechAbility =
  | { kind: 'smoke'; cooldownMs: number; radius: number; durationMs: number; damageMult: number }
  | { kind: 'overdrive'; cooldownMs: number; durationMs: number; cooldownMult: number }
  | { kind: 'leap'; cooldownMs: number; distance: number; damage: number; radius: number }
  | { kind: 'overload'; cooldownMs: number; radius: number; damage: number; hpCost: number }
  | { kind: 'dome'; cooldownMs: number; radius: number; shield: number }
  | { kind: 'emp'; cooldownMs: number; range: number; stunMs: number }
  | { kind: 'orbital'; cooldownMs: number; damage: number; radius: number };

export interface ModulePart extends PartBase {
  ability?: MechAbility;
}

export type MechProjectileKind = 'shell' | 'bullet' | 'rail' | 'drone';

/** The projectile per age for each kind of Mech shot. */
export const MECH_PROJECTILES: Readonly<Record<MechProjectileKind, readonly string[]>> = {
  shell: ['proj-boulder', 'proj-bolt', 'proj-cannonball', 'proj-shell', 'proj-plasma'],
  bullet: ['proj-stone', 'proj-arrow', 'proj-bullet', 'proj-bullet', 'proj-laser'],
  rail: ['proj-spear', 'proj-ballista', 'proj-ballista', 'proj-rail', 'proj-rail'],
  drone: ['proj-fire', 'proj-oil', 'proj-grenade', 'proj-grenade', 'proj-plasma'],
};

const level = (n: number): PartUnlock => ({ kind: 'level', level: n });
const achievement = (id: MechAchievementId): PartUnlock => ({ kind: 'achievement', id });

export const MECH_LEGS: Readonly<Record<LegsId, LegsPart>> = {
  walker: { name: 'Walker', about: '+300 HP', tier: 1, cost: 75, hp: 300, set: 'scrapper' },
  striders: { name: 'Striders', about: '+200 HP, walks 60% faster', tier: 2, cost: 120, hp: 200, speed: 1.6 },
  treads: { name: 'Treads', about: '+800 HP, armor', tier: 2, cost: 165, hp: 800, armor: 0.9, set: 'bastion' },
  stompers: { name: 'Stompers', about: '+500 HP, melee +30%', tier: 3, cost: 240, hp: 500, meleeDamage: 1.3, forge: 6, set: 'assault' },
  hover: { name: 'Hover jets', about: '+100 HP, 90% faster, shrugs off slows', tier: 3, cost: 210, hp: 100, speed: 1.9, slowImmune: true, unlock: level(3) },
  spider: { name: 'Spider legs', about: '+600 HP, guns +20% reach, no knockback', tier: 3, cost: 230, hp: 600, rangedRange: 1.2, knockbackImmune: true, unlock: achievement('mech-absorb'), set: 'arsenal' },
  jump: { name: 'Jump legs', about: '+350 HP, leaps over the front line', tier: 3, cost: 250, hp: 350, leap: { cooldownMs: 12000, damage: 40, radius: 50 }, unlock: achievement('mech-rampage'), set: 'assault' },
};

export const MECH_TORSOS: Readonly<Record<TorsoId, TorsoPart>> = {
  frame: { name: 'Frame', about: '+500 HP', tier: 1, cost: 90, hp: 500, set: 'scrapper' },
  armory: { name: 'Armory', about: '+500 HP, guns fire 35% faster', tier: 2, cost: 190, hp: 500, rangedCooldown: 0.65, set: 'arsenal' },
  hull: { name: 'Armored hull', about: '+1100 HP, armor', tier: 2, cost: 210, hp: 1100, armor: 0.9, set: 'bastion' },
  reactor: { name: 'Reactor', about: '+700 HP, weapons +35% and faster', tier: 3, cost: 300, hp: 700, damage: 1.35, cooldown: 0.85, forge: 6, set: 'energy' },
  bay: { name: 'Hangar bay', about: '+500 HP, launches drones', tier: 3, cost: 280, hp: 500, drones: { cooldownMs: 5000, damage: 60, radius: 26, range: 300 }, unlock: level(5), set: 'command' },
  overcharge: { name: 'Overcharge core', about: '+600 HP, weapons +60%, burns its own HP', tier: 3, cost: 260, hp: 600, damage: 1.6, drain: { perSec: 0.008, floor: 0.5 }, unlock: achievement('launcher-siege'), set: 'energy' },
  carrier: { name: 'Troop carrier', about: '+800 HP, drops 3 melee troops', tier: 3, cost: 270, hp: 800, troops: 3, unlock: achievement('big-army'), set: 'command' },
};

export const MECH_HEADS: Readonly<Record<HeadId, HeadPart>> = {
  visor: { name: 'Visor', about: 'Guns reach +25%, +10% damage', tier: 1, cost: 45, rangedRange: 1.25, rangedDamage: 1.1, set: 'scrapper' },
  crest: { name: 'Command crest', about: 'Allies nearby +15% damage', tier: 2, cost: 120, aura: { kind: 'buff', radius: 180, damageMult: 1.15 }, set: 'command' },
  siren: { name: 'War siren', about: 'Enemies nearby 20% slower', tier: 2, cost: 120, aura: { kind: 'slow', range: 150, mult: 0.8, durationMs: 1500 } },
  beacon: { name: 'Repair beacon', about: 'Heals itself and allies nearby', tier: 3, cost: 195, aura: { kind: 'heal', radius: 160, amount: 15, intervalMs: 1500 }, forge: 11, set: 'command' },
  scope: { name: 'Sniper scope', about: 'Guns reach +35%, hit the back line', tier: 2, cost: 150, rangedRange: 1.35, targetBack: true, unlock: level(2), set: 'arsenal' },
  taunt: { name: 'Taunt beacon', about: '+300 HP, armor, enemies near must hit it', tier: 3, cost: 180, hp: 300, armor: 0.9, taunt: { radius: 160 }, unlock: achievement('mech-absorb'), set: 'bastion' },
  salvage: { name: 'Salvage scanner', about: 'Kills near it pay +50% gold', tier: 2, cost: 140, salvage: { radius: 220, goldMult: 0.5 }, unlock: achievement('mech-hunter') },
};

export const MECH_ARMS: Readonly<Record<ArmId, ArmPart>> = {
  fist: { name: 'Fist', about: 'Heavy blows that splash', tier: 1, cost: 90, attack: { damage: 26, range: 12, cooldownMs: 1400, splashRadius: 24 }, set: 'scrapper' },
  blade: { name: 'Blade', about: 'Fast cuts', tier: 2, cost: 150, attack: { damage: 22, range: 14, cooldownMs: 800 }, set: 'assault' },
  shield: { name: 'Shield', about: '+500 HP, armor, no weapon', tier: 1, cost: 90, hp: 500, armor: 0.9, set: 'bastion' },
  launcher: { name: 'Launcher', about: 'Shells that splash, fires on the move', tier: 2, cost: 165, attack: { damage: 28, range: 160, cooldownMs: 1800, splashRadius: 20, ranged: true }, set: 'arsenal' },
  drill: { name: 'Siege drill', about: 'Bores through walls: x3 vs bases', tier: 3, cost: 225, attack: { damage: 30, range: 12, cooldownMs: 1300, baseDamageMult: 3 }, forge: 6 },
  flamer: { name: 'Flamethrower', about: 'A short cone of fire that burns', tier: 3, cost: 210, attack: { damage: 9, range: 50, cooldownMs: 500, cone: 60, burn: { dps: 8, durationMs: 3000 } }, unlock: level(2) },
  minigun: { name: 'Minigun', about: 'Spins up: very fast after 2 s', tier: 3, cost: 220, attack: { damage: 8, range: 170, cooldownMs: 650, ranged: true, projectile: 'bullet', spinUp: { fastCooldownMs: 200, rampMs: 2000 } }, unlock: level(4), set: 'arsenal' },
  tesla: { name: 'Tesla coil', about: 'Lightning that jumps to 3 more', tier: 3, cost: 240, attack: { damage: 25, range: 110, cooldownMs: 1600, chain: { jumps: 3, reach: 70, falloff: 0.75 } }, unlock: achievement('twin-guns-win'), set: 'energy' },
  railgun: { name: 'Railgun', about: 'A slow shot through the whole line', tier: 3, cost: 260, attack: { damage: 95, range: 320, cooldownMs: 4200, ranged: true, projectile: 'rail', pierce: true }, unlock: achievement('launcher-siege'), set: 'energy' },
  grapple: { name: 'Grapple claw', about: 'Pulls a back-line enemy to you', tier: 3, cost: 200, attack: { damage: 45, range: 220, cooldownMs: 4000, pull: true }, unlock: achievement('mech-hunter') },
  wrecker: { name: 'Wrecking ball', about: 'Big swings that knock enemies back', tier: 3, cost: 230, attack: { damage: 36, range: 26, cooldownMs: 1800, splashRadius: 20, knockback: 60 }, unlock: achievement('mech-rampage'), set: 'assault' },
};

export const MECH_MODULES: Readonly<Record<ModuleId, ModulePart>> = {
  none: { name: 'Empty', about: 'No module: saves gold', tier: 0, cost: 0 },
  smoke: { name: 'Smoke launcher', about: 'Enemy shots near it mostly miss, 4 s', tier: 1, cost: 60, ability: { kind: 'smoke', cooldownMs: 20_000, radius: 170, durationMs: 4000, damageMult: 0.25 }, set: 'scrapper' },
  overdrive: { name: 'Overdrive', about: 'Attacks 40% faster for 6 s', tier: 2, cost: 110, ability: { kind: 'overdrive', cooldownMs: 25_000, durationMs: 6000, cooldownMult: 1 / 1.4 }, set: 'arsenal' },
  leap: { name: 'Leap thrusters', about: 'Jumps forward, lands with splash', tier: 3, cost: 160, ability: { kind: 'leap', cooldownMs: 18_000, distance: 170, damage: 80, radius: 60 }, unlock: level(3), set: 'assault' },
  overload: { name: 'Overload', about: 'A big blast around it, costs 15% HP', tier: 3, cost: 170, ability: { kind: 'overload', cooldownMs: 22_000, radius: 110, damage: 150, hpCost: 0.15 }, unlock: level(6), set: 'energy' },
  dome: { name: 'Barrier dome', about: 'Shields it and allies nearby', tier: 3, cost: 180, ability: { kind: 'dome', cooldownMs: 30_000, radius: 150, shield: 400 }, unlock: level(4), set: 'bastion' },
  emp: { name: 'EMP pulse', about: 'Stuns turrets and heavies near it, 3 s', tier: 3, cost: 170, ability: { kind: 'emp', cooldownMs: 30_000, range: 240, stunMs: 3000 }, unlock: level(7), set: 'energy' },
  orbital: { name: 'Orbital beacon', about: 'One strike on the enemy front', tier: 3, cost: 200, ability: { kind: 'orbital', cooldownMs: 35_000, damage: 400, radius: 50 }, unlock: level(8), set: 'command' },
};

/** The options of each slot, in hangar order. */
export const MECH_OPTIONS: Readonly<Record<MechSlot, readonly string[]>> = {
  legs: Object.keys(MECH_LEGS),
  torso: Object.keys(MECH_TORSOS),
  head: Object.keys(MECH_HEADS),
  left: Object.keys(MECH_ARMS),
  right: Object.keys(MECH_ARMS),
  module: Object.keys(MECH_MODULES),
};

/** A design to start from. */
export const DEFAULT_MECH_DESIGN: MechDesign = { legs: 'walker', torso: 'frame', head: 'visor', left: 'fist', right: 'launcher', module: 'none' };

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

/**
 * Where a launcher arm's shell leaves the art, px from the Mech's position
 * (x forward, y up negative), per legs (hip height) and arm: `near` is the
 * left arm, `far` the right. Measured with `/artlab.html?muzzles`
 * (2026-09-28).
 */
export const MECH_LAUNCHER_MUZZLES: Readonly<Record<LegsId, { near: { x: number; y: number }; far: { x: number; y: number } }>> = {
  walker: { near: { x: 61, y: -59 }, far: { x: 56, y: -70 } },
  treads: { near: { x: 61, y: -48 }, far: { x: 56, y: -58 } },
  striders: { near: { x: 61, y: -66 }, far: { x: 56, y: -77 } },
  stompers: { near: { x: 61, y: -59 }, far: { x: 56, y: -70 } },
  // Expansion legs: from their hip heights (not measured yet).
  hover: { near: { x: 61, y: -61 }, far: { x: 56, y: -72 } },
  spider: { near: { x: 61, y: -55 }, far: { x: 56, y: -66 } },
  jump: { near: { x: 61, y: -61 }, far: { x: 56, y: -72 } },
};

/** Every unit id of a Mech starts with this (`entities/mechDesign.ts`). */
export const MECH_ID_PREFIX = 'mech:';
