/**
 * Every purchasable unit, as data. There is one `Unit` class; what a unit
 * does is decided by the optional blocks below (`attack`, `income`,
 * `allyPenalty`, `utility`). Adding a unit means adding a row here.
 *
 * Distances are pixels, times are milliseconds, speed is px/second.
 * `attack.range` is edge-to-edge reach: the gap between the attacker's body
 * and its target's body (or base) within which it can strike.
 *
 * All numbers are PROPOSED.
 * - Stone slots 1-3 had a first tuning pass in Phase 4 (equal-cost battle
 *   simulations; see the session log): clubbers beat slingers, mammoth riders
 *   beat clubbers, slingers beat mammoth riders in small fights, and mixed
 *   armies beat single-type armies.
 * - `killGold` is about 1.2x the unit's cost (Phase 4): with no passive
 *   income, kill gold below cost made every even trade lose gold.
 * - Later ages (Phase 8) scale the Stone numbers by an age factor of 1, 2.2,
 *   4.8, 10.5 and 23: cost, HP, damage per second, income and kill XP. Speed,
 *   range and attack rhythm are per unit, for flavor; where the rhythm
 *   changes, damage per hit changes with it so damage per second stays on
 *   the curve. Slots 4 and 5 carry their `income` / `utility` data, but act
 *   as plain units until phases 9 and 10.
 */

import type { MechAbility } from '@config/mech.config';
import type { UnitRole } from '@state/types';
import { mechDefinitionFromId } from '@entities/mechDesign';

export type { UnitRole };

/**
 * What a utility unit (slot 5) does, handled by `UtilitySystem` (Phase 10).
 * Distances are edge-to-edge along the lane, like attack reach and splash.
 *
 * - `heal`: every `intervalMs`, heals friendly units within `radius` by
 *   `amount` (never above max HP).
 * - `aoe`: every `intervalMs`, if an enemy unit is within `range`, fires a
 *   level shot (`projectileKey`) that hits the first enemy in line and deals
 *   `damage` to every enemy within `radius` of the hit.
 * - `slow`: enemy units within `range` move and attack at `mult` speed,
 *   lasting `durationMs` after they leave the range.
 * - `buff`: friendly units within `radius` deal `damageMult` damage while
 *   they stay near it.
 * - `shield`: every `intervalMs`, gives friendly units within `radius` a
 *   shield of `absorb` (a unit's shield never exceeds its max HP).
 */
export type UtilityEffect =
  | { kind: 'heal'; radius: number; amount: number; intervalMs: number }
  | {
      kind: 'aoe';
      range: number;
      radius: number;
      damage: number;
      intervalMs: number;
      projectileKey: string;
      /** Time from the start of the throw animation to the release (rig art). */
      windupMs?: number;
      /** Where the throw leaves the art (see `UnitAttack.muzzle`). */
      muzzle?: { x: number; y: number };
    }
  | { kind: 'slow'; range: number; mult: number; durationMs: number }
  | { kind: 'buff'; radius: number; damageMult: number }
  | { kind: 'shield'; radius: number; absorb: number; intervalMs: number };

export interface UnitAttack {
  damage: number;
  range: number;
  cooldownMs: number;
  splashRadius?: number;
  /** Absent means melee. */
  projectileKey?: string;
  /**
   * Time from the start of the attack animation to the hit (melee) or the
   * release (ranged), so damage lands on the strike frame (owner,
   * 2026-09-26). 0 or absent: at once.
   */
  windupMs?: number;
  /** Melee blows on a base deal this many times their damage (the Mech's siege drill). */
  baseDamageMult?: number;
  /**
   * Ranged: where the shot leaves the unit's art at the release frame, in px
   * from the unit's position (x forward, y up is negative). Measured from
   * the art with `/artlab.html?muzzles` (2026-09-28). Without it, shots
   * leave the front edge at `UNIT_SHOT_HEIGHT`.
   */
  muzzle?: { x: number; y: number };
  /*
   * Mech weapons (Mech expansion; `config/mech.config.ts` has what each
   * does). Handled by `CombatSystem`; any unit could carry them.
   */
  /** Flames: enemies up to this far past the target are hit too. */
  cone?: number;
  /** After a hit: damage per second for `durationMs` (StatusSystem). */
  burn?: { dps: number; durationMs: number };
  /** Cooldown shrinks to `fastCooldownMs` over `rampMs` of steady firing. */
  spinUp?: { fastCooldownMs: number; rampMs: number };
  /** Lightning: jumps to `jumps` more enemies within `reach`, x `falloff` each jump. */
  chain?: { jumps: number; reach: number; falloff: number };
  /** Shots fly through every unit in their way. */
  pierce?: boolean;
  /** Hooks the back-most enemy in reach and pulls it in front of the attacker. */
  pull?: boolean;
  /** Knocks the target back this many px. */
  knockback?: number;
  /** Shoots the back-most enemy in reach, over the ones in front. */
  targetBack?: boolean;
  /* Mech combo and set bonuses (`MechBonus` in config/mech.config.ts). */
  /** Every nth hit stuns the target for `stunMs`. */
  stunEvery?: number;
  stunMs?: number;
  /** Every nth attack hits every enemy in reach. */
  sweepEvery?: number;
  /** A spin-up gun keeps its spin between bursts. */
  spinKeep?: boolean;
  /** Cooldown x this while the attacker walks (a secondary weapon). */
  walkingCooldownMult?: number;
  /** A pulled enemy also takes this much damage. */
  pullHit?: number;
  /** Heals the attacker by this share of the damage dealt. */
  lifesteal?: number;
  /** The first attack of the unit's life hits x this. */
  firstHitMult?: number;
  /** Every nth hit slows the target. */
  slowEvery?: number;
}

/**
 * What a Mech's parts do beyond stats and weapons (Mech expansion), scaled
 * to the age it was built in. `MechSystem` runs these; `CombatSystem` and
 * `statusOps` read the immunities and the taunt.
 */
export interface MechBehavior {
  slowImmune?: boolean;
  knockbackImmune?: boolean;
  leap?: { cooldownMs: number; damage: number; radius: number };
  drones?: { cooldownMs: number; damage: number; radius: number; range: number; projectileKey: string };
  drain?: { perSec: number; floor: number };
  troops?: { unitId: string; count: number };
  taunt?: { radius: number };
  salvage?: { radius: number; goldMult: number };
  /* Combo and set bonuses. */
  cover?: { range: number; mult: number };
  thorns?: number;
  salvo?: { everyMs: number; shots: number };
  regen?: { radius: number; perSec: number };
  allyHp?: number;
  troopBuff?: { damage: number; ms: number };
  killGold?: { radius: number; goldMult: number };
  /** The Special module's active ability (damage and shields already scaled). */
  ability?: { moduleId: string; ability: MechAbility };
}

export interface UnitDefinition {
  id: string;
  name: string;
  /** 0-based index into the ages config. */
  age: number;
  /** 1 melee, 2 ranged, 3 heavy, 4 economy, 5 utility. */
  slot: 1 | 2 | 3 | 4 | 5;
  role: UnitRole;
  spriteKey: string;
  /**
   * Footprint width in px (blocking, spacing, reach), when the slot's
   * default doesn't fit the art (2026-09-27: the catapult crew is two wide).
   */
  bodyWidth?: number;
  /** Footprint height in px, when the slot's default doesn't fit (the Mech). */
  bodyHeight?: number;
  cost: number;
  trainTimeMs: number;
  hp: number;
  speed: number;
  killGold: number;
  killXp: number;
  /** Combat units, and utility units that also fight. */
  attack?: UnitAttack;
  /**
   * A second weapon with its own reach and cooldown (the Mech's other arm).
   * It fires whenever an enemy is in its reach, even while the unit walks;
   * `attack` alone decides when the unit stops.
   */
  secondaryAttack?: UnitAttack;
  /** Damage taken x this (base of the `damageTaken` stat; default 1). */
  armor?: number;
  /** Economy units. */
  income?: { goldPerSecond: number };
  /** Economy units: penalty applied to the owner's other units. */
  allyPenalty?: { damageMult: number; speedMult: number };
  /** Utility units. */
  utility?: UtilityEffect;
  /** Walking speed x this (only the Mech's legs; every other unit shares one pace). */
  walkSpeedMult?: number;
  /** The Mech's part behaviors. */
  mech?: MechBehavior;
}

/* ---- Stone age -------------------------------------------------------- */

const STONE_UNITS: readonly UnitDefinition[] = [
  {
    id: 'stone-clubber',
    name: 'Clubber',
    age: 0,
    slot: 1,
    role: 'combat',
    spriteKey: 'unit-stone-clubber',
    cost: 20,
    trainTimeMs: 1500,
    hp: 90,
    speed: 60,
    killGold: 25,
    killXp: 10,
    attack: { damage: 12, range: 8, cooldownMs: 1000, windupMs: 280 },
  },
  {
    id: 'stone-slinger',
    name: 'Slinger',
    age: 0,
    slot: 2,
    role: 'combat',
    spriteKey: 'unit-stone-slinger',
    cost: 30,
    trainTimeMs: 2000,
    hp: 45,
    speed: 45,
    killGold: 36,
    killXp: 15,
    attack: {
      damage: 9,
      range: 130,
      cooldownMs: 1200,
      projectileKey: 'proj-stone', muzzle: { x: 35, y: -50 },
      windupMs: 330,
    },
  },
  {
    id: 'stone-mammoth-rider',
    name: 'Mammoth Rider',
    age: 0,
    slot: 3,
    role: 'combat',
    spriteKey: 'unit-stone-mammoth-rider',
    // 2026-09-27 (owner: "mammoth very strong"): was 80 gold, 300 HP, 16 damage;
    // it beat equal gold of clubbers, slingers and mixed armies.
    cost: 90,
    trainTimeMs: 3500,
    hp: 240,
    speed: 22,
    killGold: 95,
    killXp: 40,
    // Tramples: each hit also lands on enemies within 24 px of the target
    // (about the next unit in line), which is what beats cheap melee swarms.
    attack: { damage: 14, range: 12, cooldownMs: 1600, splashRadius: 24, windupMs: 330 },
  },
  {
    // Economy: expensive, no attack, earns gold while alive (Phase 9).
    // ~100 gold at 1.3 gold/s pays back in roughly 75 seconds.
    id: 'stone-trader',
    name: 'Trader',
    age: 0,
    slot: 4,
    role: 'economy',
    spriteKey: 'unit-stone-trader',
    cost: 100,
    trainTimeMs: 5000,
    hp: 70,
    speed: 40,
    killGold: 120,
    killXp: 20,
    income: { goldPerSecond: 1.3 },
    allyPenalty: { damageMult: 0.9, speedMult: 0.9 },
  },
  {
    // Utility: heals nearby friendly units (Phase 10). Fragile, no attack.
    id: 'stone-shaman',
    name: 'Shaman',
    age: 0,
    slot: 5,
    role: 'utility',
    spriteKey: 'unit-stone-shaman',
    cost: 60,
    trainTimeMs: 3000,
    hp: 55,
    speed: 40,
    killGold: 72,
    killXp: 25,
    utility: { kind: 'heal', radius: 180, amount: 10, intervalMs: 1500 },
  },
];

/* ---- Castle age (factor 2.2) ------------------------------------------ */

const CASTLE_UNITS: readonly UnitDefinition[] = [
  {
    id: 'castle-swordsman',
    name: 'Swordsman',
    age: 1,
    slot: 1,
    role: 'combat',
    spriteKey: 'unit-castle-swordsman',
    cost: 45,
    trainTimeMs: 1500,
    hp: 200,
    speed: 60,
    killGold: 54,
    killXp: 22,
    attack: { damage: 26, range: 8, cooldownMs: 1000, windupMs: 280 },
  },
  {
    id: 'castle-archer',
    name: 'Archer',
    age: 1,
    slot: 2,
    role: 'combat',
    spriteKey: 'unit-castle-archer',
    cost: 65,
    trainTimeMs: 2000,
    hp: 100,
    speed: 45,
    killGold: 78,
    killXp: 33,
    // Longer reach than the slinger, slower draw.
    attack: { damage: 21, range: 150, cooldownMs: 1300, projectileKey: 'proj-arrow', muzzle: { x: 28, y: -51 }, windupMs: 345 },
  },
  {
    id: 'castle-knight',
    name: 'Knight',
    age: 1,
    slot: 3,
    role: 'combat',
    spriteKey: 'unit-castle-knight',
    cost: 175,
    trainTimeMs: 3500,
    hp: 600, // was 660 (2026-09-27, heavies beat equal gold of ranged)
    speed: 30,
    killGold: 210,
    killXp: 88,
    attack: { damage: 35, range: 12, cooldownMs: 1600, splashRadius: 20, windupMs: 320 },
  },
  {
    id: 'castle-merchant',
    name: 'Merchant',
    age: 1,
    slot: 4,
    role: 'economy',
    spriteKey: 'unit-castle-merchant',
    cost: 220,
    trainTimeMs: 5000,
    hp: 155,
    speed: 40,
    killGold: 264,
    killXp: 44,
    income: { goldPerSecond: 2.9 },
    allyPenalty: { damageMult: 0.9, speedMult: 0.9 },
  },
  {
    id: 'castle-catapult-crew',
    name: 'Catapult Crew',
    age: 1,
    slot: 5,
    role: 'utility',
    spriteKey: 'unit-castle-catapult-crew',
    bodyWidth: 60,
    cost: 130,
    trainTimeMs: 3000,
    hp: 120,
    speed: 35,
    killGold: 156,
    killXp: 55,
    // Lobs a stone over the front line into the enemy's front ranks.
    utility: { kind: 'aoe', range: 170, radius: 60, damage: 55, intervalMs: 2500, projectileKey: 'proj-boulder', muzzle: { x: -4, y: -38 }, windupMs: 375 },
  },
];

/* ---- Renaissance age (factor 4.8) ------------------------------------- */

const RENAISSANCE_UNITS: readonly UnitDefinition[] = [
  {
    id: 'renaissance-pikeman',
    name: 'Pikeman',
    age: 2,
    slot: 1,
    role: 'combat',
    spriteKey: 'unit-renaissance-pikeman',
    cost: 95,
    trainTimeMs: 1500,
    hp: 430,
    speed: 55,
    killGold: 114,
    killXp: 48,
    // A pike reaches a little further than a sword.
    attack: { damage: 58, range: 16, cooldownMs: 1000, windupMs: 280 },
  },
  {
    id: 'renaissance-musketeer',
    name: 'Musketeer',
    age: 2,
    slot: 2,
    role: 'combat',
    spriteKey: 'unit-renaissance-musketeer',
    cost: 145,
    trainTimeMs: 2000,
    hp: 215,
    speed: 45,
    killGold: 174,
    killXp: 72,
    // Slow reload, heavy ball.
    attack: { damage: 65, range: 160, cooldownMs: 1800, projectileKey: 'proj-bullet', muzzle: { x: 40, y: -49 }, windupMs: 375 },
  },
  {
    id: 'renaissance-cuirassier',
    name: 'Cuirassier',
    age: 2,
    slot: 3,
    role: 'combat',
    spriteKey: 'unit-renaissance-cuirassier',
    cost: 385,
    trainTimeMs: 3500,
    hp: 1300, // was 1440 (2026-09-27)
    speed: 40,
    killGold: 462,
    killXp: 192,
    // Armored cavalry: a faster heavy.
    attack: { damage: 77, range: 12, cooldownMs: 1600, splashRadius: 20, windupMs: 320 },
  },
  {
    id: 'renaissance-banker',
    name: 'Banker',
    age: 2,
    slot: 4,
    role: 'economy',
    spriteKey: 'unit-renaissance-banker',
    cost: 480,
    trainTimeMs: 5000,
    hp: 335,
    speed: 40,
    killGold: 576,
    killXp: 96,
    income: { goldPerSecond: 6.2 },
    allyPenalty: { damageMult: 0.9, speedMult: 0.9 },
  },
  {
    id: 'renaissance-alchemist',
    name: 'Alchemist',
    age: 2,
    slot: 5,
    role: 'utility',
    spriteKey: 'unit-renaissance-alchemist',
    cost: 290,
    trainTimeMs: 3000,
    hp: 265,
    speed: 40,
    killGold: 348,
    killXp: 120,
    utility: { kind: 'slow', range: 160, mult: 0.6, durationMs: 3000 },
  },
];

/* ---- Modern age (factor 10.5) ----------------------------------------- */

const MODERN_UNITS: readonly UnitDefinition[] = [
  {
    // Slot 1 is melee by design: the rifleman fights with the bayonet.
    id: 'modern-rifleman',
    name: 'Rifleman',
    age: 3,
    slot: 1,
    role: 'combat',
    spriteKey: 'unit-modern-rifleman',
    cost: 210,
    trainTimeMs: 1500,
    hp: 945,
    speed: 60,
    killGold: 252,
    killXp: 105,
    attack: { damage: 126, range: 10, cooldownMs: 1000, windupMs: 280 },
  },
  {
    id: 'modern-sniper',
    name: 'Sniper',
    age: 3,
    slot: 2,
    role: 'combat',
    spriteKey: 'unit-modern-sniper',
    cost: 315,
    trainTimeMs: 2000,
    hp: 470,
    speed: 45,
    killGold: 378,
    killXp: 158,
    // Longest reach of any unit; 15% less damage per second to pay for it.
    attack: { damage: 147, range: 220, cooldownMs: 2200, projectileKey: 'proj-bullet', muzzle: { x: 40, y: -39 }, windupMs: 410 },
  },
  {
    id: 'modern-tank',
    name: 'Tank',
    age: 3,
    slot: 3,
    role: 'combat',
    spriteKey: 'unit-modern-tank',
    cost: 840,
    trainTimeMs: 3500,
    hp: 3150,
    speed: 22,
    killGold: 1008,
    killXp: 420,
    // A heavy that shoots: short-range shells that splash.
    attack: { damage: 210, range: 110, cooldownMs: 2000, splashRadius: 28, projectileKey: 'proj-shell', muzzle: { x: 55, y: -38 }, windupMs: 375 },
  },
  {
    id: 'modern-contractor',
    name: 'Contractor',
    age: 3,
    slot: 4,
    role: 'economy',
    spriteKey: 'unit-modern-contractor',
    cost: 1050,
    trainTimeMs: 5000,
    hp: 735,
    speed: 40,
    killGold: 1260,
    killXp: 210,
    income: { goldPerSecond: 13.7 },
    allyPenalty: { damageMult: 0.9, speedMult: 0.9 },
  },
  {
    id: 'modern-officer',
    name: 'Officer',
    age: 3,
    slot: 5,
    role: 'utility',
    spriteKey: 'unit-modern-officer',
    cost: 630,
    trainTimeMs: 3000,
    hp: 580,
    speed: 40,
    killGold: 756,
    killXp: 263,
    utility: { kind: 'buff', radius: 160, damageMult: 1.25 },
  },
];

/* ---- Future age (factor 23) ------------------------------------------- */

const FUTURE_UNITS: readonly UnitDefinition[] = [
  {
    id: 'future-blade-trooper',
    name: 'Blade Trooper',
    age: 4,
    slot: 1,
    role: 'combat',
    spriteKey: 'unit-future-blade-trooper',
    cost: 460,
    trainTimeMs: 1500,
    hp: 2070,
    speed: 70,
    killGold: 552,
    killXp: 230,
    // Quick slashes: faster rhythm, same damage per second curve.
    attack: { damage: 221, range: 8, cooldownMs: 800, windupMs: 225 },
  },
  {
    id: 'future-laser-gunner',
    name: 'Laser Gunner',
    age: 4,
    slot: 2,
    role: 'combat',
    spriteKey: 'unit-future-laser-gunner',
    cost: 690,
    trainTimeMs: 2000,
    hp: 1035,
    speed: 50,
    killGold: 828,
    killXp: 345,
    // Rapid fire.
    attack: { damage: 104, range: 170, cooldownMs: 600, projectileKey: 'proj-laser', muzzle: { x: 33, y: -49 }, windupMs: 205 },
  },
  {
    id: 'future-mech',
    name: 'Mech',
    age: 4,
    slot: 3,
    role: 'combat',
    spriteKey: 'unit-future-mech',
    cost: 1840,
    trainTimeMs: 3500,
    hp: 6900,
    speed: 25,
    killGold: 2208,
    killXp: 920,
    // Close-range plasma bursts that splash.
    attack: { damage: 368, range: 50, cooldownMs: 1600, splashRadius: 28, projectileKey: 'proj-plasma', muzzle: { x: 40, y: -68 }, windupMs: 320 },
  },
  {
    id: 'future-broker-drone',
    name: 'Broker Drone',
    age: 4,
    slot: 4,
    role: 'economy',
    spriteKey: 'unit-future-broker-drone',
    cost: 2300,
    trainTimeMs: 5000,
    hp: 1610,
    speed: 45,
    killGold: 2760,
    killXp: 460,
    income: { goldPerSecond: 29.9 },
    allyPenalty: { damageMult: 0.9, speedMult: 0.9 },
  },
  {
    id: 'future-shield-drone',
    name: 'Shield Drone',
    age: 4,
    slot: 5,
    role: 'utility',
    spriteKey: 'unit-future-shield-drone',
    cost: 1380,
    trainTimeMs: 3000,
    hp: 1265,
    speed: 45,
    killGold: 1656,
    killXp: 575,
    utility: { kind: 'shield', radius: 160, absorb: 230, intervalMs: 4000 },
  },
];

export const UNIT_DEFINITIONS: readonly UnitDefinition[] = [
  ...STONE_UNITS,
  ...CASTLE_UNITS,
  ...RENAISSANCE_UNITS,
  ...MODERN_UNITS,
  ...FUTURE_UNITS,
];

const UNITS_BY_ID: ReadonlyMap<string, UnitDefinition> = new Map(
  UNIT_DEFINITIONS.map((def) => [def.id, def]),
);

/** Looks up a unit definition, failing loudly on an unknown id. Mech ids are built from the design they spell out. */
export function getUnitDefinition(id: string): UnitDefinition {
  const def = findUnitDefinition(id);
  if (!def) throw new Error(`Unknown unit id: "${id}"`);
  return def;
}

/** Like `getUnitDefinition`, but returns undefined for an unknown id. For
 * validating requests that come from outside (UI, AI, console). */
export function findUnitDefinition(id: string): UnitDefinition | undefined {
  return UNITS_BY_ID.get(id) ?? mechDefinitionFromId(id);
}
