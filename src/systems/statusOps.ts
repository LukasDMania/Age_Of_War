/**
 * The one way unit stats change (Phase 7). Like `economyOps` and
 * `damageOps`, these helpers mutate entities and emit the notifications, so
 * any system can slow, buff or shield a unit without a reference to
 * `StatusSystem`, which only expires timed modifiers and keeps side-wide
 * ones applied to new units.
 *
 * Effective stat = base x product of the unit's modifiers of that stat, read
 * through `Unit.getStat`. Modifiers with the same `id` replace each other
 * (re-applying a slow refreshes it instead of stacking it).
 *
 * Max HP changes keep the unit's HP ratio: a 1.5x max HP buff on a unit at
 * half health leaves it at half of the new, larger maximum.
 *
 * Emits: `modifier-applied`, `modifier-removed`.
 */
import type { StatModifier, Unit } from '@entities/Unit';
import type { MatchState } from '@state/GameState';
import type { Side, SideModifier } from '@state/types';
import { MECH_ID_PREFIX } from '@config/mech.config';
import { emit, Events } from '@utils/EventBus';

/**
 * How a max HP change treats current HP: `ratio` keeps the HP ratio (a 1.5x
 * buff at half health leaves the unit at half of the new maximum); `keep`
 * keeps the HP it has (only the maximum grows; it never heals).
 */
export type HpMode = 'ratio' | 'keep';

function keepHpRatio(unit: Unit, change: () => void, mode: HpMode = 'ratio'): void {
  const before = unit.getStat('maxHp');
  change();
  const after = unit.getStat('maxHp');
  if (before !== after && before > 0) {
    unit.hp = Math.min(after, mode === 'keep' ? unit.hp : (unit.hp / before) * after);
    unit.markBarDirty();
  }
}

/** Adds a modifier (replacing one with the same id) and emits `modifier-applied`. */
export function applyModifier(unit: Unit, modifier: StatModifier, hpMode: HpMode = 'ratio'): void {
  if (!unit.isAlive) return;
  if (!Number.isFinite(modifier.mult) || modifier.mult < 0) {
    throw new Error(`Invalid modifier multiplier: ${modifier.mult}`);
  }
  keepHpRatio(unit, () => {
    const existing = unit.modifiers.findIndex((m) => m.id === modifier.id);
    if (existing >= 0) unit.modifiers.splice(existing, 1);
    unit.modifiers.push(modifier);
  }, hpMode);
  emit(Events.ModifierApplied, {
    instanceId: unit.instanceId,
    modifierId: modifier.id,
    stat: modifier.stat,
    mult: modifier.mult,
  });
}

/** Removes a modifier by id. Returns whether it was there; emits `modifier-removed` if so. */
export function removeModifier(unit: Unit, modifierId: string): boolean {
  const index = unit.modifiers.findIndex((m) => m.id === modifierId);
  if (index < 0) return false;
  keepHpRatio(unit, () => unit.modifiers.splice(index, 1));
  emit(Events.ModifierRemoved, { instanceId: unit.instanceId, modifierId });
  return true;
}

/**
 * Adds to a unit's shield: `amount` x its `shield` stat, capped at `cap`
 * (default: its max HP). Returns the new shield.
 */
export function grantShield(unit: Unit, amount: number, cap = unit.getStat('maxHp')): number {
  if (!unit.isAlive || !(amount > 0)) return unit.shield;
  unit.shield = Math.min(cap, unit.shield + amount * unit.getStat('shield'));
  unit.markBarDirty();
  return unit.shield;
}

/** Whether a side-wide modifier applies to this unit. */
export function sideModifierApplies(modifier: SideModifier, unit: Unit): boolean {
  if (modifier.exemptRoles?.includes(unit.definition.role)) return false;
  if (modifier.mech) {
    const isMech = unit.definition.id.startsWith(MECH_ID_PREFIX);
    if ((modifier.mech === 'only') !== isMech) return false;
  }
  return !modifier.onlySlots || modifier.onlySlots.includes(unit.definition.slot);
}

/**
 * Sets (or replaces, by id) a modifier on every unit of `side`, now and for
 * units spawned later (`StatusSystem` handles those). Stored on
 * `SideState.modifiers`.
 */
export function setSideModifier(
  match: MatchState,
  units: Iterable<Unit>,
  side: Side,
  modifier: SideModifier,
): void {
  const list = match[side].modifiers;
  const existing = list.findIndex((m) => m.id === modifier.id);
  if (existing >= 0) list.splice(existing, 1);
  list.push(modifier);
  for (const unit of units) {
    if (unit.side !== side || !unit.isAlive) continue;
    if (sideModifierApplies(modifier, unit)) applyModifier(unit, toUnitModifier(modifier));
    else removeModifier(unit, modifier.id);
  }
}

/** Removes a side-wide modifier from the side and all its units. */
export function clearSideModifier(match: MatchState, units: Iterable<Unit>, side: Side, modifierId: string): void {
  const list = match[side].modifiers;
  const index = list.findIndex((m) => m.id === modifierId);
  if (index >= 0) list.splice(index, 1);
  for (const unit of units) {
    if (unit.side === side) removeModifier(unit, modifierId);
  }
}

/** The per-unit copy of a side-wide modifier. */
export function toUnitModifier(modifier: SideModifier): StatModifier {
  return { id: modifier.id, source: modifier.source, stat: modifier.stat, mult: modifier.mult };
}
