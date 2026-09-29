import { AGES, getAge } from '@config/ages.config';
import {
  MECH,
  MECH_ARMS,
  MECH_HEADS,
  MECH_ID_PREFIX,
  MECH_LAUNCHER_MUZZLES,
  MECH_LEGS,
  MECH_OPTIONS,
  MECH_SLOTS,
  MECH_TORSOS,
  type ArmPart,
  type MechDesign,
  type MechSlot,
} from '@config/mech.config';
import { rigWindupMs } from '@config/unitArt.config';
import type { UnitAttack, UnitDefinition, UtilityEffect } from '@entities/unitDefinitions';

/**
 * A Mech design as a unit (the Mech workshop, `config/mech.config.ts`).
 * The unit id spells out the design and the age it was built in
 * (`mech:<age>:<legs>:<torso>:<head>:<left>:<right>`), so a definition can
 * be rebuilt from its id anywhere (`getUnitDefinition` asks here for ids it
 * doesn't know). Still one `Unit` class: the parts become ordinary data.
 *
 * - HP: the core plus the parts, times the age factor. Armor (damage taken)
 *   multiplies over the parts that have it.
 * - Arms: each armed arm is one attack. The shorter-reach one is the main
 *   attack (it decides when the Mech stops); the other is its
 *   `secondaryAttack`, which fires whenever something is in its reach, even
 *   while walking (a launcher shoots on the way to the fight). A shield arm
 *   has no weapon.
 * - Head: gun reach and damage, or an aura (the unit's `utility`).
 * - Slot 3 (heavy), so heavy research and counters apply.
 */

/** The shell a launcher arm fires in each age. */
export const MECH_SHELLS: readonly string[] = ['proj-boulder', 'proj-bolt', 'proj-cannonball', 'proj-shell', 'proj-plasma'];

export function isMechUnitId(id: string): boolean {
  return id.startsWith(MECH_ID_PREFIX);
}

export function mechUnitId(design: MechDesign, age: number): string {
  return `${MECH_ID_PREFIX}${age}:${MECH_SLOTS.map((slot) => design[slot]).join(':')}`;
}

/** The design and age of a Mech unit id, or null if it isn't a valid one. */
export function parseMechId(id: string): { design: MechDesign; age: number } | null {
  if (!isMechUnitId(id)) return null;
  const [ageText, ...parts] = id.slice(MECH_ID_PREFIX.length).split(':');
  const age = Number(ageText);
  if (!Number.isInteger(age) || age < 0 || age >= AGES.length || parts.length !== MECH_SLOTS.length) return null;
  const design: Partial<Record<MechSlot, string>> = {};
  for (const [i, slot] of MECH_SLOTS.entries()) {
    const part = parts[i]!;
    if (!MECH_OPTIONS[slot].includes(part)) return null;
    design[slot] = part;
  }
  return { design: design as MechDesign, age };
}

/** Whether every part of a design exists (designs from storage or requests). */
export function isValidDesign(design: unknown): design is MechDesign {
  if (typeof design !== 'object' || design === null) return false;
  const d = design as Record<string, unknown>;
  return MECH_SLOTS.every((slot) => typeof d[slot] === 'string' && MECH_OPTIONS[slot].includes(d[slot] as string));
}

/** The part picked in a slot, whatever its kind (name, tier, cost, Forge level). */
export function mechPart(design: MechDesign, slot: MechSlot): { name: string; about: string; tier: number; cost: number; forge?: number } {
  switch (slot) {
    case 'legs':
      return MECH_LEGS[design.legs];
    case 'torso':
      return MECH_TORSOS[design.torso];
    case 'head':
      return MECH_HEADS[design.head];
    case 'left':
      return MECH_ARMS[design.left];
    case 'right':
      return MECH_ARMS[design.right];
  }
}

export function designTier(design: MechDesign): number {
  return MECH_SLOTS.reduce((sum, slot) => sum + mechPart(design, slot).tier, 0);
}

/** Gold to build a design in an age (rounded to 5). */
export function designCost(design: MechDesign, age: number): number {
  const parts = MECH_SLOTS.reduce((sum, slot) => sum + mechPart(design, slot).cost, 0);
  const mult = 1 + MECH.tierCost * (designTier(design) - MECH_SLOTS.length);
  return Math.round((parts * mult * getAge(age).scale) / 5) * 5;
}

export function designBuildMs(design: MechDesign): number {
  return MECH.buildMs + MECH.buildPerTierMs * (designTier(design) - MECH_SLOTS.length);
}

/** The first slot whose part needs a higher Forge level than `forgeLevel`, or null. */
export function lockedSlot(design: MechDesign, forgeLevel: number): MechSlot | null {
  return MECH_SLOTS.find((slot) => (mechPart(design, slot).forge ?? 0) > forgeLevel) ?? null;
}

function armAttack(arm: ArmPart, design: MechDesign, age: number, hand: 'near' | 'far'): UnitAttack | null {
  const a = arm.attack;
  if (!a) return null;
  const torso = MECH_TORSOS[design.torso];
  const head = MECH_HEADS[design.head];
  const legs = MECH_LEGS[design.legs];
  const boost = a.ranged ? (head.rangedDamage ?? 1) : (legs.meleeDamage ?? 1);
  const attack: UnitAttack = {
    damage: Math.round(a.damage * getAge(age).scale * (torso.damage ?? 1) * boost),
    range: Math.round(a.range * (a.ranged ? (head.rangedRange ?? 1) : 1)),
    cooldownMs: Math.round(a.cooldownMs * (torso.cooldown ?? 1) * (a.ranged ? (torso.rangedCooldown ?? 1) : 1)),
    windupMs: rigWindupMs(MECH.attackRate),
  };
  if (a.splashRadius) attack.splashRadius = a.splashRadius;
  if (a.ranged) {
    attack.projectileKey = MECH_SHELLS[age] ?? 'proj-shell';
    attack.muzzle = MECH_LAUNCHER_MUZZLES[design.legs][hand];
  }
  if (a.baseDamageMult) attack.baseDamageMult = a.baseDamageMult;
  return attack;
}

function aura(design: MechDesign, age: number): UtilityEffect | undefined {
  const a = MECH_HEADS[design.head].aura;
  if (!a) return undefined;
  if (a.kind === 'heal') return { ...a, amount: Math.round(a.amount * getAge(age).scale) };
  return { ...a };
}

const cache = new Map<string, UnitDefinition>();

/** The unit definition of a design built in `age`. */
export function mechDefinition(design: MechDesign, age: number): UnitDefinition {
  const id = mechUnitId(design, age);
  const cached = cache.get(id);
  if (cached) return cached;
  const scale = getAge(age).scale;
  const parts = MECH_SLOTS.map((slot) => mechPart(design, slot) as { hp?: number; armor?: number });
  const hp = MECH.coreHp + parts.reduce((sum, p) => sum + (p.hp ?? 0), 0);
  const armor = parts.reduce((mult, p) => mult * (p.armor ?? 1), 1);
  // Main attack: the shorter reach (it decides where the Mech stops).
  const attacks = [armAttack(MECH_ARMS[design.left], design, age, 'near'), armAttack(MECH_ARMS[design.right], design, age, 'far')]
    .filter((a): a is UnitAttack => a !== null)
    .sort((a, b) => a.range - b.range);
  const [main, second] = attacks;
  const cost = designCost(design, age);
  const definition: UnitDefinition = {
    id,
    name: 'Mech',
    age,
    slot: 3,
    role: 'combat',
    spriteKey: MECH.spriteKey,
    bodyWidth: MECH.bodyWidth,
    bodyHeight: MECH.bodyHeight,
    cost,
    trainTimeMs: designBuildMs(design),
    hp: Math.round(hp * scale),
    speed: Math.round(MECH.speed * (MECH_LEGS[design.legs].speed ?? 1)),
    killGold: Math.round(cost * MECH.killGold),
    killXp: Math.round(cost * MECH.killXp),
    ...(armor < 1 ? { armor: Math.round(armor * 1000) / 1000 } : {}),
    ...(main ? { attack: main } : {}),
    ...(second ? { secondaryAttack: { ...second, windupMs: 0 } } : {}),
  };
  const utility = aura(design, age);
  if (utility) definition.utility = utility;
  cache.set(id, definition);
  return definition;
}

/** The definition behind a Mech unit id, or undefined. */
export function mechDefinitionFromId(id: string): UnitDefinition | undefined {
  const parsed = parseMechId(id);
  return parsed ? mechDefinition(parsed.design, parsed.age) : undefined;
}

/** Numbers for the Workshop card: HP, effective HP after armor, damage per second (units), cost, build time. */
export function designSummary(design: MechDesign, age: number): { hp: number; toughness: number; dps: number; cost: number; buildMs: number; armed: boolean } {
  const def = mechDefinition(design, age);
  const dps = [def.attack, def.secondaryAttack].reduce((sum, a) => sum + (a ? (a.damage * 1000) / a.cooldownMs : 0), 0);
  return {
    hp: def.hp,
    toughness: Math.round(def.hp / (def.armor ?? 1)),
    dps: Math.round(dps),
    cost: def.cost,
    buildMs: def.trainTimeMs,
    armed: def.attack !== undefined,
  };
}

/** What the hangar's stat bars show for a design. */
export interface MechStats {
  hp: number;
  /** Damage per second of both arms. */
  dps: number;
  /** The longest weapon reach, px (0 unarmed). */
  range: number;
  /** Walking speed, px/s. */
  speed: number;
  /** Damage taken is cut by this share (0..1). */
  armor: number;
}

export type MechStatKey = keyof MechStats;

export function designStats(design: MechDesign, age: number): MechStats {
  const def = mechDefinition(design, age);
  const attacks = [def.attack, def.secondaryAttack].filter((a): a is UnitAttack => a !== undefined);
  return {
    hp: def.hp,
    dps: Math.round(attacks.reduce((sum, a) => sum + (a.damage * 1000) / a.cooldownMs, 0)),
    range: attacks.reduce((max, a) => Math.max(max, a.range), 0),
    speed: def.speed,
    armor: Math.round((1 - (def.armor ?? 1)) * 100) / 100,
  };
}

/**
 * The most each stat can reach in an age (a full bar), taken slot by slot
 * so it stays cheap however many parts there are.
 */
export function designStatCaps(age: number): MechStats {
  const best = <T,>(list: readonly T[], f: (t: T) => number): number => list.reduce((m, t) => Math.max(m, f(t)), 0);
  const legs = MECH_OPTIONS.legs.map((id) => MECH_LEGS[id as keyof typeof MECH_LEGS]);
  const torsos = MECH_OPTIONS.torso.map((id) => MECH_TORSOS[id as keyof typeof MECH_TORSOS]);
  const heads = MECH_OPTIONS.head.map((id) => MECH_HEADS[id as keyof typeof MECH_HEADS]);
  const arms = MECH_OPTIONS.left.map((id) => MECH_ARMS[id as keyof typeof MECH_ARMS]);
  const hp = MECH.coreHp + best(legs, (p) => p.hp ?? 0) + best(torsos, (p) => p.hp ?? 0) + best(heads, (p) => p.hp ?? 0) + 2 * best(arms, (p) => p.hp ?? 0);
  const armDps = best(arms, (arm) => {
    const a = arm.attack;
    if (!a) return 0;
    return best(torsos, (t) => {
      const cd = a.cooldownMs * (t.cooldown ?? 1) * (a.ranged ? (t.rangedCooldown ?? 1) : 1);
      const boost = a.ranged ? best(heads, (h) => h.rangedDamage ?? 1) : best(legs, (l) => l.meleeDamage ?? 1);
      return (a.damage * (t.damage ?? 1) * boost * 1000) / cd;
    });
  });
  const minArmor = (list: readonly { armor?: number }[]): number => list.reduce((m, p) => Math.min(m, p.armor ?? 1), 1);
  return {
    hp: Math.round(hp * getAge(age).scale),
    dps: Math.round(2 * armDps * getAge(age).scale),
    range: Math.round(best(arms, (a) => (a.attack ? a.attack.range * (a.attack.ranged ? best(heads, (h) => h.rangedRange ?? 1) : 1) : 0))),
    speed: Math.round(MECH.speed * best(legs, (l) => l.speed ?? 1)),
    armor: 1 - minArmor(legs) * minArmor(torsos) * minArmor(heads) * minArmor(arms) ** 2,
  };
}

/** Role tags on the hangar's build sheet, from what the parts do. */
export type MechRole = 'Tank' | 'Brawler' | 'Artillery' | 'Support' | 'Utility';

export function designRoles(design: MechDesign): MechRole[] {
  const arms = [MECH_ARMS[design.left], MECH_ARMS[design.right]];
  const armored = MECH_SLOTS.filter((slot) => ((mechPart(design, slot) as { armor?: number }).armor ?? 1) < 1).length;
  const melee = arms.filter((a) => a.attack && !a.attack.ranged).length;
  const ranged = arms.filter((a) => a.attack?.ranged).length;
  const roles: MechRole[] = [];
  if (armored >= 2) roles.push('Tank');
  if (melee > 0 && (ranged === 0 || MECH_LEGS[design.legs].meleeDamage)) roles.push('Brawler');
  if (ranged > 0) roles.push('Artillery');
  if (MECH_HEADS[design.head].aura) roles.push('Support');
  return roles;
}
