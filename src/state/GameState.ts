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
import { AGE_COUNT } from '@config/ages.config';
import type { MatchPhase, MechState, QueuedUnit, SideModifier } from '@state/types';
import { defaultTraits, type SideTraits } from '@state/traits';
import { randomSeed } from '@utils/Rng';

export type { MatchPhase, QueuedUnit, Side } from '@state/types';

/** One built turret. `spent` tracks upgrade gold for sell refunds. */
export interface TurretState {
  turretId: string;
  level: number;
  spent: number;
  /** Units it killed this match (Conquest's Veteran crews trait levels it up with them). */
  kills?: number;
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
  /**
   * Highest age this side may reach in this match (the last age normally;
   * Conquest chapters lock battles to their age). Set at match setup.
   */
  maxAge: number;
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
  /** The Mech being built or on the lane (owned by MechSystem). */
  mech: MechState;
  /**
   * Mech parts this side may not build (`kind:id` keys, `partKey`): the
   * player's account hasn't opened them yet. Set at match setup; empty
   * means every part is open.
   */
  mechLocked: string[];
  /** Rule changes from Conquest rewards (`state/traits.ts`); neutral otherwise. Set at battle setup. */
  traits: SideTraits;
}

export interface MatchState {
  phase: MatchPhase;
  /**
   * Seed for everything random that changes the battle (`Rng.derive(seed,
   * label)` per consumer). Lockstep multiplayer gives both browsers the same
   * seed; a replay with the same seed and commands plays out the same.
   */
  seed: number;
  player: SideState;
  enemy: SideState;
}

export function createSideState(): SideState {
  return {
    gold: STARTING_GOLD,
    xp: STARTING_XP,
    age: 0,
    maxAge: AGE_COUNT - 1,
    baseHp: BASE_HP,
    unlockedSlots: STARTING_TURRET_SLOTS,
    turrets: Array.from({ length: MAX_TURRET_SLOTS }, () => null),
    specialReadyAt: 0,
    trainingQueue: [],
    modifiers: [],
    buildings: emptyBuildings(),
    research: emptyResearch(),
    buildingPerks: emptyPerks(),
    mech: { build: null, alive: false },
    mechLocked: [],
    traits: defaultTraits(),
  };
}

/**
 * Builds a brand-new match state. A factory rather than a singleton so a
 * restart is just "create another one" with nothing leaking across matches.
 */
export function createGameState(seed: number = randomSeed()): MatchState {
  return {
    phase: 'pre-game',
    seed,
    player: createSideState(),
    enemy: createSideState(),
  };
}
