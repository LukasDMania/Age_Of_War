import {
  BASE_HP,
  MAX_TURRET_SLOTS,
  STARTING_GOLD,
  STARTING_TURRET_SLOTS,
  STARTING_XP,
} from '@config/constants';
import {
  emptyBuildings,
  emptyPerks,
  emptyResearch,
  type BuildingId,
  type PerkChoice,
  type ResearchId,
} from '@config/buildings.config';
import type { MatchPhase, QueuedUnit, SideModifier } from '@state/types';

export type { MatchPhase, QueuedUnit, Side } from '@state/types';

/** One built turret. `spent` tracks upgrade gold for sell refunds. */
export interface TurretState {
  turretId: string;
  level: number;
  spent: number;
}

/**
 * Everything one participant owns. Player and enemy share this shape so no
 * logic is written twice.
 *
 * Gold and XP are only ever changed through `state/economyOps.ts`, never
 * assigned directly. The training queue is owned by `SpawnSystem`.
 */
export interface SideState {
  gold: number;
  xp: number;
  /** 0-based index into the ages config. */
  age: number;
  baseHp: number;
  unlockedSlots: number;
  /** Length is the slot cap; `null` means an empty slot. */
  turrets: (TurretState | null)[];
  /** Scene time in ms at which the special can be fired again. */
  specialReadyAt: number;
  /** Units paid for and waiting to be trained, front first. */
  trainingQueue: QueuedUnit[];
  /** Modifiers applied to every unit of this side (owned by StatusSystem). */
  modifiers: SideModifier[];
  /** Building levels behind the base; 0 = not built (Phase 14, owned by BuildingSystem). */
  buildings: Record<BuildingId, number>;
  /** Forge research tiers bought per track (Phase 14, owned by BuildingSystem). */
  research: Record<ResearchId, number>;
  /** Perks picked per building, in order (prototype, owned by BuildingSystem). */
  buildingPerks: Record<BuildingId, PerkChoice[]>;
}

export interface MatchState {
  phase: MatchPhase;
  player: SideState;
  enemy: SideState;
}

export function createSideState(): SideState {
  return {
    gold: STARTING_GOLD,
    xp: STARTING_XP,
    age: 0,
    baseHp: BASE_HP,
    unlockedSlots: STARTING_TURRET_SLOTS,
    turrets: Array.from({ length: MAX_TURRET_SLOTS }, () => null),
    specialReadyAt: 0,
    trainingQueue: [],
    modifiers: [],
    buildings: emptyBuildings(),
    research: emptyResearch(),
    buildingPerks: emptyPerks(),
  };
}

/**
 * Builds a brand-new match state. A factory rather than a singleton so a
 * restart is just "create another one" with nothing leaking across matches.
 */
export function createGameState(): MatchState {
  return {
    phase: 'pre-game',
    player: createSideState(),
    enemy: createSideState(),
  };
}
