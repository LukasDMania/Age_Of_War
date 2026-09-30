import { AGES, getAge } from '@config/ages.config';
import { UNIT_WALK_SPEED } from '@config/constants';
import {
  MECH,
  MECH_ARMS,
  MECH_BODY_SLOTS,
  MECH_COMBOS,
  MECH_HEADS,
  MECH_ID_PREFIX,
  MECH_LAUNCHER_MUZZLES,
  MECH_LEGS,
  MECH_MODULES,
  MECH_OPTIONS,
  MECH_PROJECTILES,
  MECH_SETS,
  MECH_SLOTS,
  MECH_TORSOS,
  MECH_UTILITY,
  TITAN,
  type ArmId,
  type ArmPart,
  type ComboPart,
  type MechAbility,
  type MechBonus,
  type MechCombo,
  type MechDesign,
  type MechSetId,
  type MechSlot,
  type PartUnlock,
  type UtilityPartEffect,
} from '@config/mech.config';
import { rigWindupMs } from '@config/unitArt.config';
import type { MechBehavior, UnitAttack, UnitDefinition, UtilityEffect } from '@entities/unitDefinitions';

/**
 * A Mech design as a unit (the Mech workshop, `config/mech.config.ts`).
 * The unit id spells out the design and the age it was built in
 * (`mech:<age>:<legs>:<torso>:<head>:<left>:<right>:<module>`), so a
 * definition can be rebuilt from its id anywhere (`getUnitDefinition` asks
 * here for ids it doesn't know). Still one `Unit` class: the parts become
 * ordinary data.
 *
 * - HP: the core plus the parts, times the age factor. Armor (damage taken)
 *   multiplies over the parts that have it.
 * - Arms: each armed arm is one attack. The shorter-reach one is the main
 *   attack (it decides when the Mech stops); the other is its
 *   `secondaryAttack`, which fires whenever something is in its reach, even
 *   while walking (a launcher shoots on the way to the fight). A shield arm
 *   has no weapon. Weapon behaviors (flames, lightning, pull...) are copied
 *   onto the attack for `CombatSystem`.
 * - Head: gun reach and damage, or an aura (the unit's `utility`).
 * - Everything else a part does goes in the definition's `mech` block
 *   (immunities, leaps, drones, troops, the module's ability) for
 *   `MechSystem`.
 * - Slot 3 (heavy), so heavy research and counters apply.
 */

export function isMechUnitId(id: string): boolean {
  return id.startsWith(MECH_ID_PREFIX);
}

export function mechUnitId(design: MechDesign, age: number, titan = false): string {
  return `${MECH_ID_PREFIX}${age}:${MECH_SLOTS.map((slot) => design[slot]).join(':')}${titan ? TITAN.idSuffix : ''}`;
}

/** The design and age of a Mech unit id, or null if it isn't a valid one. Ids without a module (older) read as `none`. */
export function parseMechId(id: string): { design: MechDesign; age: number; titan: boolean } | null {
  if (!isMechUnitId(id)) return null;
  const titan = id.endsWith(TITAN.idSuffix);
  const [ageText, ...parts] = id.slice(MECH_ID_PREFIX.length, titan ? -TITAN.idSuffix.length : undefined).split(':');
  const age = Number(ageText);
  if (!Number.isInteger(age) || age < 0 || age >= AGES.length) return null;
  if (parts.length === MECH_BODY_SLOTS.length) parts.push('none');
  if (parts.length !== MECH_SLOTS.length) return null;
  const design: Partial<Record<MechSlot, string>> = {};
  for (const [i, slot] of MECH_SLOTS.entries()) {
    const part = parts[i]!;
    if (!MECH_OPTIONS[slot].includes(part)) return null;
    design[slot] = part;
  }
  return { design: design as MechDesign, age, titan };
}

/** Whether every part of a design exists (designs from storage or requests). */
export function isValidDesign(design: unknown): design is MechDesign {
  if (typeof design !== 'object' || design === null) return false;
  const d = design as Record<string, unknown>;
  return MECH_SLOTS.every((slot) => typeof d[slot] === 'string' && MECH_OPTIONS[slot].includes(d[slot] as string));
}

/** What the hangar and the rules need of any part. */
export interface PartInfo {
  name: string;
  about: string;
  tier: number;
  cost: number;
  forge?: number;
  unlock?: PartUnlock;
  set?: MechSetId;
  hp?: number;
  armor?: number;
  utility?: UtilityPartEffect;
}

/** A part by slot and id, whatever its kind. */
export function partInfo(slot: MechSlot, id: string): PartInfo {
  switch (slot) {
    case 'legs':
      return MECH_LEGS[id as keyof typeof MECH_LEGS];
    case 'torso':
      return MECH_TORSOS[id as keyof typeof MECH_TORSOS];
    case 'head':
      return MECH_HEADS[id as keyof typeof MECH_HEADS];
    case 'left':
    case 'right':
      return MECH_ARMS[id as keyof typeof MECH_ARMS];
    case 'module':
      return MECH_MODULES[id as keyof typeof MECH_MODULES];
  }
}

/** The part picked in a slot. */
export function mechPart(design: MechDesign, slot: MechSlot): PartInfo {
  return partInfo(slot, design[slot]);
}

export function designTier(design: MechDesign): number {
  return MECH_SLOTS.reduce((sum, slot) => sum + mechPart(design, slot).tier, 0);
}

/** A set's progress on a design: pieces worn and how many steps are active. */
export interface SetProgress {
  id: MechSetId;
  pieces: number;
  /** Steps reached (0: none yet). */
  active: number;
  /** Pieces the next step needs, or null at the top. */
  next: number | null;
}

export interface DesignBonuses {
  combos: MechCombo[];
  /** Every set with at least one piece, most pieces first. */
  sets: SetProgress[];
  /** Everything active, combos first. */
  bonuses: MechBonus[];
}

function hasComboPart(design: MechDesign, part: ComboPart): number {
  switch (part.slot) {
    case 'arm':
      return (design.left === part.id ? 1 : 0) + (design.right === part.id ? 1 : 0);
    default:
      return design[part.slot] === part.id ? 1 : 0;
  }
}

const bonusCache = new Map<string, DesignBonuses>();

/** The pair combos and set steps a design has (Mech expansion section 3). */
export function designBonuses(design: MechDesign): DesignBonuses {
  const key = MECH_SLOTS.map((slot) => design[slot]).join(':');
  const cached = bonusCache.get(key);
  if (cached) return cached;
  const combos = MECH_COMBOS.filter((combo) => {
    const [a, b] = combo.parts;
    // The same part twice (Blade + Blade) needs it in both hands.
    if (a.slot === b.slot && a.id === b.id) return hasComboPart(design, a) >= 2;
    return hasComboPart(design, a) > 0 && hasComboPart(design, b) > 0;
  });
  const counts = new Map<MechSetId, number>();
  for (const slot of MECH_SLOTS) {
    const set = mechPart(design, slot).set;
    if (set) counts.set(set, (counts.get(set) ?? 0) + 1);
  }
  const sets: SetProgress[] = [...counts.entries()]
    .map(([id, pieces]) => {
      const steps = MECH_SETS[id].steps;
      const active = steps.filter((step) => pieces >= step.pieces).length;
      return { id, pieces, active, next: steps[active]?.pieces ?? null };
    })
    .sort((a, b) => b.pieces - a.pieces);
  const bonuses: MechBonus[] = [
    ...combos.flatMap((c) => c.bonuses),
    ...sets.flatMap((s) => MECH_SETS[s.id].steps.slice(0, s.active).flatMap((step) => step.bonuses)),
  ];
  const result = { combos, sets, bonuses };
  bonusCache.set(key, result);
  return result;
}

function bonusMult(design: MechDesign, kind: 'hp' | 'armor' | 'damage' | 'cost' | 'buildTime'): number {
  return designBonuses(design).bonuses.reduce((m, b) => (b.kind === kind ? m * b.mult : m), 1);
}

/** Gold to build a design in an age (rounded to 5). */
export function designCost(design: MechDesign, age: number): number {
  const parts = MECH_SLOTS.reduce((sum, slot) => sum + mechPart(design, slot).cost, 0);
  const mult = 1 + MECH.tierCost * (designTier(design) - MECH_BODY_SLOTS.length);
  return Math.round((parts * mult * getAge(age).scale * bonusMult(design, 'cost')) / 5) * 5;
}

export function designBuildMs(design: MechDesign): number {
  return Math.round((MECH.buildMs + MECH.buildPerTierMs * (designTier(design) - MECH_BODY_SLOTS.length)) * bonusMult(design, 'buildTime'));
}

/** A part's key in the account's lock list: both arms share `arm`. */
export function partKey(slot: MechSlot, id: string): string {
  return `${slot === 'left' || slot === 'right' ? 'arm' : slot}:${id}`;
}

/** The first slot whose part the account hasn't opened (`SideState.mechLocked`), or null. */
export function accountLockedSlot(design: MechDesign, locked: readonly string[]): MechSlot | null {
  if (locked.length === 0) return null;
  return MECH_SLOTS.find((slot) => locked.includes(partKey(slot, design[slot]))) ?? null;
}

/** The first slot whose part needs a higher Forge level than `forgeLevel`, or null. */
export function lockedSlot(design: MechDesign, forgeLevel: number): MechSlot | null {
  return MECH_SLOTS.find((slot) => (mechPart(design, slot).forge ?? 0) > forgeLevel) ?? null;
}

/** An arm bonus's target: the arm by id, or by kind. */
function armMatches(target: ArmId | 'melee' | 'ranged' | 'any', id: ArmId, arm: ArmPart): boolean {
  const a = arm.attack;
  if (!a) return false;
  if (target === 'any') return true;
  if (target === 'ranged') return a.ranged === true;
  if (target === 'melee') return !a.ranged && !a.pull;
  return target === id;
}

function armAttack(id: ArmId, design: MechDesign, age: number, hand: 'near' | 'far', withBonuses = true): UnitAttack | null {
  const arm: ArmPart = MECH_ARMS[id];
  const a = arm.attack;
  if (!a) return null;
  const torso = MECH_TORSOS[design.torso];
  const head = MECH_HEADS[design.head];
  const legs = MECH_LEGS[design.legs];
  const scale = getAge(age).scale;
  const boost = a.ranged ? (head.rangedDamage ?? 1) : (legs.meleeDamage ?? 1);
  const reach = a.ranged ? (head.rangedRange ?? 1) * (legs.rangedRange ?? 1) : 1;
  const attack: UnitAttack = {
    damage: Math.round(a.damage * scale * (torso.damage ?? 1) * boost),
    range: Math.round(a.range * reach),
    cooldownMs: Math.round(a.cooldownMs * (torso.cooldown ?? 1) * (a.ranged ? (torso.rangedCooldown ?? 1) : 1)),
    windupMs: rigWindupMs(MECH.attackRate),
  };
  if (a.splashRadius) attack.splashRadius = a.splashRadius;
  if (a.ranged) {
    attack.projectileKey = MECH_PROJECTILES[a.projectile ?? 'shell'][age] ?? 'proj-shell';
    attack.muzzle = MECH_LAUNCHER_MUZZLES[design.legs][hand];
    if (head.targetBack) attack.targetBack = true;
  }
  if (a.baseDamageMult) attack.baseDamageMult = a.baseDamageMult;
  if (a.cone) attack.cone = a.cone;
  if (a.burn) attack.burn = { dps: Math.round(a.burn.dps * scale * (torso.damage ?? 1)), durationMs: a.burn.durationMs };
  // A spin-up gun fires off its own rhythm, not the arm's strike frame.
  if (a.spinUp) attack.windupMs = 0;
  if (a.spinUp) attack.spinUp = { fastCooldownMs: Math.round(a.spinUp.fastCooldownMs * (torso.cooldown ?? 1) * (torso.rangedCooldown ?? 1)), rampMs: a.spinUp.rampMs };
  if (a.chain) attack.chain = { ...a.chain };
  if (a.pierce) attack.pierce = true;
  if (a.pull) attack.pull = true;
  if (a.knockback) attack.knockback = a.knockback;
  if (!withBonuses) return attack;
  const damageAll = bonusMult(design, 'damage');
  if (damageAll !== 1) attack.damage = Math.round(attack.damage * damageAll);
  for (const b of designBonuses(design).bonuses) {
    if (b.kind !== 'arm' || !armMatches(b.arm, id, arm)) continue;
    if (b.rangeMult) attack.range = Math.round(attack.range * b.rangeMult);
    if (b.damageMult) attack.damage = Math.round(attack.damage * b.damageMult);
    if (b.cooldownMult) {
      attack.cooldownMs = Math.round(attack.cooldownMs * b.cooldownMult);
      if (attack.spinUp) attack.spinUp.fastCooldownMs = Math.round(attack.spinUp.fastCooldownMs * b.cooldownMult);
    }
    if (b.baseDamageMult) attack.baseDamageMult = b.baseDamageMult;
    if (b.burnDurationMult && attack.burn) attack.burn.durationMs = Math.round(attack.burn.durationMs * b.burnDurationMult);
    if (b.chainJumps && attack.chain) attack.chain.jumps += b.chainJumps;
    if (b.stunEvery) {
      attack.stunEvery = b.stunEvery;
      attack.stunMs = b.stunMs ?? 800;
    }
    if (b.sweepEvery) attack.sweepEvery = b.sweepEvery;
    if (b.spinKeep) attack.spinKeep = true;
    if (b.walkingCooldownMult) attack.walkingCooldownMult = b.walkingCooldownMult;
    if (b.pullHitWith) attack.pullHit = armAttack(b.pullHitWith, design, age, hand, false)?.damage ?? 0;
    if (b.lifesteal) attack.lifesteal = (attack.lifesteal ?? 0) + b.lifesteal;
    if (b.firstHitMult) attack.firstHitMult = b.firstHitMult;
    if (b.slowEvery) attack.slowEvery = b.slowEvery;
  }
  return attack;
}

function aura(design: MechDesign, age: number): UtilityEffect | undefined {
  const a = MECH_HEADS[design.head].aura;
  if (!a) return undefined;
  let reach = 1;
  let heal = 1;
  for (const b of designBonuses(design).bonuses) {
    if (b.kind !== 'aura') continue;
    reach *= b.radiusMult ?? 1;
    heal *= b.healMult ?? 1;
  }
  switch (a.kind) {
    case 'heal':
      return { ...a, radius: Math.round(a.radius * reach), amount: Math.round(a.amount * getAge(age).scale * heal) };
    case 'slow':
      return { ...a, range: Math.round(a.range * reach) };
    case 'buff':
      return { ...a, radius: Math.round(a.radius * reach) };
  }
}

/** A module's ability with its damage and shield in the age's scale. */
function scaledAbility(ability: MechAbility, age: number): MechAbility {
  const scale = getAge(age).scale;
  switch (ability.kind) {
    case 'leap':
    case 'overload':
    case 'orbital':
      return { ...ability, damage: Math.round(ability.damage * scale) };
    case 'dome':
      return { ...ability, shield: Math.round(ability.shield * scale) };
    default:
      return { ...ability };
  }
}

function behavior(design: MechDesign, age: number): MechBehavior | undefined {
  const scale = getAge(age).scale;
  const legs = MECH_LEGS[design.legs];
  const torso = MECH_TORSOS[design.torso];
  const head = MECH_HEADS[design.head];
  const module = MECH_MODULES[design.module];
  const b: MechBehavior = {};
  if (legs.slowImmune) b.slowImmune = true;
  if (legs.knockbackImmune) b.knockbackImmune = true;
  if (legs.leap) b.leap = { ...legs.leap, damage: Math.round(legs.leap.damage * scale) };
  if (torso.drones) {
    b.drones = {
      ...torso.drones,
      damage: Math.round(torso.drones.damage * scale),
      projectileKey: MECH_PROJECTILES.drone[age] ?? 'proj-grenade',
    };
  }
  if (torso.drain) b.drain = { ...torso.drain };
  if (torso.troops) b.troops = { unitId: getAge(age).unitIds[0], count: torso.troops };
  if (head.taunt) b.taunt = { ...head.taunt };
  if (head.salvage) b.salvage = { ...head.salvage };
  if (module.ability) b.ability = { moduleId: design.module, ability: scaledAbility(module.ability, age) };
  if (isUtilityDesign(design)) {
    const u = { lifetimeMs: MECH_UTILITY.lifetimeMs, output: MECH_UTILITY.output, discount: 0, craftEveryMs: null as number | null, repairPerSec: 0 };
    for (const slot of MECH_SLOTS) {
      const e = mechPart(design, slot).utility;
      if (!e) continue;
      u.lifetimeMs += e.lifetimeMs ?? 0;
      u.output += e.output ?? 0;
      u.discount = Math.min(0.6, u.discount + (e.discount ?? 0));
      if (e.craftEveryMs) u.craftEveryMs = Math.min(u.craftEveryMs ?? Infinity, e.craftEveryMs);
      u.repairPerSec += e.repairPerSec ?? 0;
    }
    b.utility = u;
  }
  for (const bonus of designBonuses(design).bonuses) {
    if (bonus.kind !== 'mech') continue;
    if (bonus.slowImmune) b.slowImmune = true;
    if (bonus.knockbackImmune) b.knockbackImmune = true;
    if (bonus.cover) b.cover = { ...bonus.cover };
    if (bonus.thorns) b.thorns = (b.thorns ?? 0) + bonus.thorns;
    if (bonus.taunt && !b.taunt) b.taunt = { ...bonus.taunt };
    if (bonus.salvo) b.salvo = { ...bonus.salvo };
    if (bonus.regen) b.regen = { ...bonus.regen };
    if (bonus.allyHp) b.allyHp = bonus.allyHp;
    if (bonus.troopBuff) b.troopBuff = { ...bonus.troopBuff };
    if (bonus.killGold) b.killGold = { ...bonus.killGold };
    if (bonus.leapDamageMult && b.leap) b.leap.damage = Math.round(b.leap.damage * bonus.leapDamageMult);
  }
  return Object.keys(b).length > 0 ? b : undefined;
}

const cache = new Map<string, UnitDefinition>();

/** The unit definition of a design built in `age` (as a Titan: bigger, tougher, pricier). */
export function mechDefinition(design: MechDesign, age: number, titan = false): UnitDefinition {
  const id = mechUnitId(design, age, titan);
  const cached = cache.get(id);
  if (cached) return cached;
  const scale = getAge(age).scale;
  const parts = MECH_SLOTS.map((slot) => mechPart(design, slot));
  const hp = (MECH.coreHp + parts.reduce((sum, p) => sum + (p.hp ?? 0), 0)) * bonusMult(design, 'hp');
  const armor = parts.reduce((mult, p) => mult * (p.armor ?? 1), 1) * bonusMult(design, 'armor');
  // Main attack: the shorter reach (it decides where the Mech stops).
  const attacks = [armAttack(design.left, design, age, 'near'), armAttack(design.right, design, age, 'far')]
    .filter((a): a is UnitAttack => a !== null)
    .sort((a, b) => a.range - b.range);
  const [main, second] = attacks;
  const cost = designCost(design, age);
  const walk = MECH_LEGS[design.legs].speed ?? 1;
  if (titan) {
    for (const a of [main, second]) {
      if (!a) continue;
      a.damage = Math.round(a.damage * TITAN.damage);
      if (a.muzzle) a.muzzle = { x: Math.round(a.muzzle.x * TITAN.scale), y: Math.round(a.muzzle.y * TITAN.scale) };
      if (a.splashRadius) a.splashRadius = Math.round(a.splashRadius * 1.5);
    }
  }
  const price = titan ? Math.round((cost * TITAN.cost) / 5) * 5 : cost;
  const definition: UnitDefinition = {
    id,
    name: titan ? 'Titan' : 'Mech',
    age,
    slot: 3,
    role: 'combat',
    spriteKey: titan ? TITAN.spriteKey : MECH.spriteKey,
    bodyWidth: titan ? Math.round(MECH.bodyWidth * TITAN.scale * 0.8) : MECH.bodyWidth,
    bodyHeight: titan ? Math.round(MECH.bodyHeight * TITAN.scale) : MECH.bodyHeight,
    cost: price,
    trainTimeMs: Math.round(designBuildMs(design) * (titan ? TITAN.buildTime : 1)),
    hp: Math.round(hp * scale * (titan ? TITAN.hp : 1)),
    speed: Math.round(UNIT_WALK_SPEED * walk),
    killGold: Math.round(price * MECH.killGold),
    killXp: Math.round(price * MECH.killXp),
    ...(walk !== 1 ? { walkSpeedMult: walk } : {}),
    ...(armor < 1 ? { armor: Math.round(armor * 1000) / 1000 } : {}),
    ...(main ? { attack: main } : {}),
    ...(second ? { secondaryAttack: { ...second, windupMs: 0 } } : {}),
  };
  const utility = aura(design, age);
  if (utility) definition.utility = utility;
  const mech = behavior(design, age);
  if (mech) definition.mech = mech;
  if (titan) definition.mech = { ...definition.mech, knockbackImmune: true };
  cache.set(id, definition);
  return definition;
}

/** The definition behind a Mech unit id, or undefined. */
export function mechDefinitionFromId(id: string): UnitDefinition | undefined {
  const parsed = parseMechId(id);
  return parsed ? mechDefinition(parsed.design, parsed.age, parsed.titan) : undefined;
}

/** Damage per second of one attack (a spin-up weapon at full speed counts half-way). */
function attackDps(a: UnitAttack): number {
  const cooldown = a.spinUp ? (a.cooldownMs + a.spinUp.fastCooldownMs) / 2 : a.cooldownMs;
  const targets = a.chain ? 1 + a.chain.jumps * a.chain.falloff * 0.6 : 1;
  const burn = a.burn ? a.burn.dps : 0;
  return (a.damage * targets * 1000) / cooldown + burn;
}

/** Numbers for the hangar: HP, effective HP after armor, damage per second (units), cost, build time. */
export function designSummary(design: MechDesign, age: number): { hp: number; toughness: number; dps: number; cost: number; buildMs: number; armed: boolean } {
  const def = mechDefinition(design, age);
  const dps = [def.attack, def.secondaryAttack].reduce((sum, a) => sum + (a ? attackDps(a) : 0), 0);
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
    dps: Math.round(attacks.reduce((sum, a) => sum + attackDps(a), 0)),
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
  const legs = Object.values(MECH_LEGS);
  const torsos = Object.values(MECH_TORSOS);
  const heads = Object.values(MECH_HEADS);
  const arms = Object.values(MECH_ARMS);
  const hp = MECH.coreHp + best(legs, (p) => p.hp ?? 0) + best(torsos, (p) => p.hp ?? 0) + best(heads, (p) => p.hp ?? 0) + 2 * best(arms, (p) => p.hp ?? 0);
  // Any design's arms are two of these; the biggest two-arm total is the cap.
  const dpsOf = (d: MechDesign): number => designStats(d, age).dps;
  let dps = 0;
  for (const left of Object.keys(MECH_ARMS)) {
    for (const torso of Object.keys(MECH_TORSOS)) {
      const d = { legs: 'stompers', torso, head: 'visor', left, right: left, module: 'none' } as MechDesign;
      dps = Math.max(dps, dpsOf(d));
    }
  }
  const minArmor = (list: readonly { armor?: number }[]): number => list.reduce((m, p) => Math.min(m, p.armor ?? 1), 1);
  const reach = best(heads, (h) => h.rangedRange ?? 1) * best(legs, (l) => l.rangedRange ?? 1);
  return {
    hp: Math.round(hp * getAge(age).scale),
    dps,
    range: Math.round(best(arms, (a) => (a.attack ? a.attack.range * (a.attack.ranged ? reach : 1) : 0))),
    speed: Math.round(UNIT_WALK_SPEED * best(legs, (l) => l.speed ?? 1)),
    armor: 1 - minArmor(legs) * minArmor(torsos) * minArmor(heads) * minArmor(arms) ** 2,
  };
}

/** How many of a design's parts are utility parts. */
export function utilityParts(design: MechDesign): number {
  return MECH_SLOTS.filter((slot) => mechPart(design, slot).utility !== undefined).length;
}

/** A utility Mech (owner: "a part based switch"): enough utility parts, and it works at a building instead of fighting. */
export function isUtilityDesign(design: MechDesign): boolean {
  return utilityParts(design) >= MECH_UTILITY.minParts;
}

/** Role tags on the hangar's build sheet, from what the parts do. */
export type MechRole = 'Tank' | 'Brawler' | 'Artillery' | 'Support' | 'Utility';

export function designRoles(design: MechDesign): MechRole[] {
  const arms = [MECH_ARMS[design.left], MECH_ARMS[design.right]];
  const armored = MECH_SLOTS.filter((slot) => (mechPart(design, slot).armor ?? 1) < 1).length;
  const melee = arms.filter((a) => a.attack && !a.attack.ranged && !a.attack.pull).length;
  const ranged = arms.filter((a) => a.attack?.ranged).length;
  const head = MECH_HEADS[design.head];
  const torso = MECH_TORSOS[design.torso];
  if (isUtilityDesign(design)) return ['Utility'];
  const roles: MechRole[] = [];
  if (armored >= 2 || head.taunt) roles.push('Tank');
  if (melee > 0 && (ranged === 0 || MECH_LEGS[design.legs].meleeDamage)) roles.push('Brawler');
  if (ranged > 0) roles.push('Artillery');
  if (head.aura || torso.troops || torso.drones || design.module === 'dome') roles.push('Support');
  if (head.salvage) roles.push('Utility');
  return roles;
}

/**
 * A random design whose cost in `age` is within `band` of `targetCost`
 * (the closest of `samples` tries if none is). `rand` returns 0..1.
 */
export function randomDesign(rand: () => number, age: number, targetCost: number, band: number, samples: number): MechDesign {
  const pick = (slot: MechSlot): string => {
    const options = MECH_OPTIONS[slot];
    return options[Math.floor(rand() * options.length)] ?? options[0]!;
  };
  let best: MechDesign | null = null;
  let bestGap = Infinity;
  for (let i = 0; i < samples; i++) {
    const design = Object.fromEntries(MECH_SLOTS.map((slot) => [slot, pick(slot)])) as unknown as MechDesign;
    // A duel needs a weapon on each side.
    if (!MECH_ARMS[design.left].attack && !MECH_ARMS[design.right].attack) continue;
    const gap = Math.abs(designCost(design, age) / Math.max(1, targetCost) - 1);
    if (gap < bestGap) {
      best = design;
      bestGap = gap;
    }
    if (gap <= band && rand() < 0.5) return design;
  }
  return best ?? { legs: 'walker', torso: 'frame', head: 'visor', left: 'fist', right: 'launcher', module: 'none' };
}
