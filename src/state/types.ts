import type { MechDesign } from '@config/mech.config';

/**
 * Small shared vocabulary types. This file imports nothing so that config,
 * state, events and entities can all depend on it without import cycles.
 */

/** The two participants. Both use the same `SideState` shape. */
export type Side = 'player' | 'enemy';

export const SIDES: readonly Side[] = ['player', 'enemy'];

export function otherSide(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

/** Direction a side's units walk along the lane: +1 rightwards, -1 leftwards. */
export function laneDir(side: Side): 1 | -1 {
  return side === 'player' ? 1 : -1;
}

/** One unit waiting in (or being trained by) a side's training queue. */
export interface QueuedUnit {
  unitId: string;
  /** Training time left. 0 means trained and waiting for a clear spawn point. */
  remainingMs: number;
}

/** A side's Mech (the Mech workshop): the one being built, and whether one is on the lane. */
export interface MechState {
  /** Being built: its unit id (the design and age) and the build time left. */
  build: { unitId: string; remainingMs: number; totalMs: number } | null;
  /** A Mech of this side is alive (only one at a time). */
  alive: boolean;
  /** Sim time (ms) when its Special module can be used again. */
  abilityReadyAt?: number;
  /** The Titan (experimental) was built this match: once only. */
  titanBuilt?: boolean;
  /**
   * A utility Mech's work (Mech expansion section 7, owned by MechSystem,
   * read by BuildingSystem): the building it goes to or works at (a
   * `BuildingId`), whether it is there, and what it does to that building.
   */
  assist?: { buildingId: string; working: boolean; output: number; discount: number } | null;
}

/** Match state machine. See `MatchSystem` (Phase 2). */
export type MatchPhase = 'pre-game' | 'playing' | 'paused' | 'gameover';

/**
 * Stats that `StatusSystem` modifiers can scale (Phase 7). Effective stat =
 * base x product of modifiers, read through the unit's single accessor.
 *
 * `shield` is not the shield itself (that is a pool on the unit, `Unit.shield`,
 * which absorbs damage before HP); it is how strong shields granted to the
 * unit are. Its base value is 1.
 */
export type ModifiableStat =
  | 'damage'
  | 'speed'
  | 'attackCooldown'
  | 'maxHp'
  | 'shield'
  /** Attack reach in px (Phase 14 research). Base: `attack.range`. */
  | 'range'
  /** Multiplier on damage the unit takes; base 1, below 1 is armor (Phase 14). */
  | 'damageTaken'
  /** Multiplier on damage from shots (projectiles) on top of `damageTaken`; base 1 (Conquest's Shield wall). */
  | 'shotDamageTaken';

/** What a unit is for; decided by its slot (see `UnitDefinition.role`). */
export type UnitRole = 'combat' | 'economy' | 'utility';

/**
 * A modifier applied to every unit of one side, including units that spawn
 * later (Phase 7 foundation, used by the money-unit penalty in Phase 9).
 * Kept on `SideState.modifiers`; `StatusSystem` copies it onto each unit.
 */
export interface SideModifier {
  id: string;
  source: string;
  stat: ModifiableStat;
  mult: number;
  /** Unit roles that are not affected (e.g. economy units by their own penalty). */
  exemptRoles?: readonly UnitRole[];
  /** If set, only units in these slots are affected (Forge research, Phase 14). */
  onlySlots?: readonly number[];
  /** `only`: just the side's Mech; `exclude`: everything but the Mech. */
  mech?: 'only' | 'exclude';
}

/** A unit slot: 1 melee, 2 ranged, 3 heavy, 4 money, 5 utility (design section 3). */
export type UnitSlot = 1 | 2 | 3 | 4 | 5;

/** Part of an army composition (hotkey armies): `count` units of the current age's `slot`. */
export interface ArmyEntry {
  slot: UnitSlot;
  count: number;
}

export type Army = readonly ArmyEntry[];

/** Mech Arena phases (GAME_DESIGN 15): farm, hangar, fight, then a short result pause. */
export type ArenaPhase = 'farm' | 'hangar' | 'fight' | 'round-over';

/**
 * Mech Arena state (owned by ArenaSystem): part of `MatchState`, so both
 * lockstep browsers hold (and hash) the same.
 */
export interface ArenaState {
  age: number;
  phase: ArenaPhase;
  round: number;
  wins: Record<Side, number>;
  /** Game ms when the phase ends. */
  phaseEndsAt: number;
  /** Farm: raider waves spawned so far, and when the next raider is due. */
  wave: number;
  nextRaiderAt: number;
  /** Raiders still to come in the current wave, by unit id (both sides get each). */
  waveQueue: string[];
  /** Hangar: each side's chosen Mech (paid), or null. */
  picks: Record<Side, MechDesign | null>;
  /** Hangar: what the pick cost (refunded if changed). */
  paid: Record<Side, number>;
  /** The side that lost the round before (its starting bonus), or null. */
  lastLoser: Side | null;
}

/** What the HUD hears about the arena (`arena-changed`). */
export interface ArenaView {
  phase: ArenaPhase;
  round: number;
  wins: Record<Side, number>;
  /** Game ms left in the phase. */
  remainingMs: number;
  /** Whether each side has picked its Mech (hangar). */
  picked: Record<Side, boolean>;
}
