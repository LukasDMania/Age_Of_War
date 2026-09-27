/**
 * What one side's army does differently in this match: the behaviour
 * rewards of Conquest's archetype paths (2026-09-28, GAME_DESIGN section
 * 15). Plain data on `SideState.traits`, filled once at battle setup by
 * `ConquestSystem` from the run's `ConquestEffect`s and read by the systems
 * that own each rule (a unit's price by `SpawnSystem`, lifesteal by
 * `CombatSystem`, ricochets by `ProjectileSystem`, and so on). Outside
 * Conquest every trait is neutral, so nothing changes.
 *
 * Stat changes stay side modifiers (`statusOps`); traits are only for rules
 * that aren't a stat.
 */
import type { UnitDefinition } from '@entities/unitDefinitions';

export type UnitSlot = 1 | 2 | 3 | 4 | 5;
export type TurretKind = 'rapid' | 'heavy' | 'area';

export const UNIT_SLOTS: readonly UnitSlot[] = [1, 2, 3, 4, 5];

export interface SideTraits {
  /** A unit's price x this, per slot. */
  unitCost: Record<UnitSlot, number>;
  /** A unit's training time x this, per slot. */
  trainTime: Record<UnitSlot, number>;
  /** Share of the damage a unit's blows deal that heals it, per slot (melee only). */
  lifesteal: Partial<Record<UnitSlot, number>>;
  /** Every nth shot of a unit in this slot flies on through one more enemy. */
  pierceEvery: Partial<Record<UnitSlot, number>>;
  /** A slot's shots mark what they hit: it takes `mult` x damage for `durationMs`. */
  mark: Partial<Record<UnitSlot, { mult: number; durationMs: number }>>;
  /** A unit's first attack deals this many times its damage, per slot. */
  firstStrike: Partial<Record<UnitSlot, number>>;
  /** Damage a slot's attacks (blows, shots and their splash) deal to bases x this. */
  baseDamage: Partial<Record<UnitSlot, number>>;
  /** Turret shots of a kind bounce on to the next enemy behind the target for this share of their damage. */
  turretBounce: Partial<Record<TurretKind, number>>;
  /** A turret gains a free level every this many kills (0: off). */
  turretKillsPerLevel: number;
  /** Every turret's damage x this. */
  turretDamage: number;
  /** The Mine: output x this (grown each minute by `mineGrowthPerMinute`); closed: no output, no upgrades. */
  mineMult: number;
  mineGrowthPerMinute: number;
  mineClosed: boolean;
  /** Money units' income x this. */
  moneyIncome: number;
  /** The Mech: price and build time x these; parts' Forge needs are this many levels lower. */
  mechCost: number;
  mechBuildTime: number;
  mechForgeBonus: number;
}

export function defaultTraits(): SideTraits {
  return {
    unitCost: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
    trainTime: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
    lifesteal: {},
    pierceEvery: {},
    mark: {},
    firstStrike: {},
    baseDamage: {},
    turretBounce: {},
    turretKillsPerLevel: 0,
    turretDamage: 1,
    mineMult: 1,
    mineGrowthPerMinute: 0,
    mineClosed: false,
    moneyIncome: 1,
    mechCost: 1,
    mechBuildTime: 1,
    mechForgeBonus: 0,
  };
}

/** What a unit costs a side (its slot's price trait; rounded to whole gold). */
export function unitPrice(traits: SideTraits, definition: UnitDefinition): number {
  const mult = traits.unitCost[definition.slot];
  return mult === 1 ? definition.cost : Math.max(1, Math.round(definition.cost * mult));
}
