import { ARMY_COUNT } from '@config/keybindings.config';
import { getAge } from '@config/ages.config';
import { UNIT_QUEUE_LIMIT } from '@config/constants';
import { getUnitDefinition } from '@entities/unitDefinitions';
import type { SideState } from '@state/GameState';
import type { Side } from '@state/types';
import { emit, Events } from '@utils/EventBus';

/**
 * Unit compositions ("armies", owner 2026-09-27: like StarCraft control
 * groups, "shift+f2 = 2 melee 3 rangers in queue"). An army is a list of
 * slots and counts, **by slot** so it works in every age (LOCKED, owner).
 * Queuing one buys its units in order through `buy-unit-requested`, like
 * clicks, and **stops** at the first unit it can't afford or when the
 * training queue is full (LOCKED, owner). Kept per browser; UI only.
 */

export type UnitSlot = 1 | 2 | 3 | 4 | 5;

export interface ArmyEntry {
  slot: UnitSlot;
  count: number;
}

export type Army = readonly ArmyEntry[];

/** Names by slot, the same in every age (design section 3). */
export const SLOT_ROLES: Readonly<Record<UnitSlot, string>> = { 1: 'Melee', 2: 'Ranged', 3: 'Heavy', 4: 'Money', 5: 'Utility' };

const STORAGE_KEY = 'aow-armies';

/** Starting armies, so F1-F3 do something before any editing (PROPOSED). */
const DEFAULT_ARMIES: readonly Army[] = [
  [{ slot: 1, count: 2 }, { slot: 2, count: 1 }],
  [{ slot: 1, count: 1 }, { slot: 2, count: 2 }],
  [{ slot: 3, count: 1 }, { slot: 1, count: 2 }],
];

function isEntry(value: unknown): value is ArmyEntry {
  const e = value as ArmyEntry;
  return typeof e === 'object' && e !== null && [1, 2, 3, 4, 5].includes(e.slot) && Number.isInteger(e.count) && e.count > 0;
}

function load(): Army[] {
  let stored: unknown = null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }
  return Array.from({ length: ARMY_COUNT }, (_, i) => {
    const saved = Array.isArray(stored) ? (stored[i] as unknown) : undefined;
    if (Array.isArray(saved) && saved.every(isEntry)) return saved.map((e) => ({ slot: e.slot, count: e.count }));
    return stored === null ? [...(DEFAULT_ARMIES[i] ?? [])] : [];
  });
}

let armies: Army[] = load();

function save(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(armies));
  } catch {
    // Storage can be unavailable; the armies then last until reload.
  }
}

/** Army `index` (0-based). */
export function getArmy(index: number): Army {
  return armies[index] ?? [];
}

export function setArmy(index: number, army: Army): void {
  if (index < 0 || index >= ARMY_COUNT) return;
  armies = armies.map((a, i) => (i === index ? army.filter((e) => e.count > 0).map((e) => ({ ...e })) : a));
  save();
}

/** One more unit of `slot` at the end (joins the last entry when it's the same slot). */
export function withUnit(army: Army, slot: UnitSlot): Army {
  const last = army[army.length - 1];
  if (last && last.slot === slot) return [...army.slice(0, -1), { slot, count: last.count + 1 }];
  return [...army, { slot, count: 1 }];
}

/** Without its last unit. */
export function withoutLastUnit(army: Army): Army {
  const last = army[army.length - 1];
  if (!last) return army;
  return last.count > 1 ? [...army.slice(0, -1), { slot: last.slot, count: last.count - 1 }] : army.slice(0, -1);
}

export function unitCount(army: Army): number {
  return army.reduce((sum, e) => sum + e.count, 0);
}

/** "Melee x2, Ranged x3" ('Empty' for none). */
export function armyLabel(army: Army): string {
  return army.length > 0 ? army.map((e) => `${SLOT_ROLES[e.slot]} x${e.count}`).join(', ') : 'Empty';
}

/** An army from what a side is training now (in queue order). */
export function armyFromQueue(side: SideState): Army {
  let army: Army = [];
  for (const entry of side.trainingQueue) army = withUnit(army, getUnitDefinition(entry.unitId).slot as UnitSlot);
  return army;
}

export interface QueueResult {
  queued: number;
  wanted: number;
  /** Why it stopped early, or null when every unit went in. */
  stoppedBy: 'gold' | 'queue' | null;
}

/**
 * Buys an army's units in order for `side` (the current age's unit in each
 * slot) and stops at the first one it can't afford or when the queue is
 * full. `SpawnSystem` still decides each purchase.
 */
export function queueArmy(side: Side, state: SideState, army: Army): QueueResult {
  const wanted = unitCount(army);
  let queued = 0;
  for (const entry of army) {
    const unitId = getAge(state.age).unitIds[entry.slot - 1];
    if (!unitId) continue;
    for (let i = 0; i < entry.count; i++) {
      if (state.trainingQueue.length >= UNIT_QUEUE_LIMIT) return { queued, wanted, stoppedBy: 'queue' };
      const before = state.trainingQueue.length;
      emit(Events.BuyUnitRequested, { side, unitId });
      if (state.trainingQueue.length === before) {
        return { queued, wanted, stoppedBy: state.trainingQueue.length >= UNIT_QUEUE_LIMIT ? 'queue' : 'gold' };
      }
      queued++;
    }
  }
  return { queued, wanted, stoppedBy: null };
}
