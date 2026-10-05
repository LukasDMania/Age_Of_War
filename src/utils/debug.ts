/**
 * Dev-only handle at `window.__aow`, for poking at a running match from the
 * browser console or an automated check. Only installed when
 * `import.meta.env.DEV` is true, so it never ships in a production build.
 */
import type { TurnRecord } from '@net/protocol';
import type { BuildingId, ResearchId } from '@config/buildings.config';
import type { AiDifficultyName } from '@config/ai.config';
import type { GameSceneData } from '@/scenes/GameScene';
import type { SideStats } from '@systems/StatsSystem';
import type { MatchState, TurretState } from '@state/GameState';
import type { MatchPhase, ModifiableStat, QueuedUnit, Side } from '@state/types';
import type { eventBus } from '@utils/EventBus';

export interface UnitSnapshot {
  id: number;
  unitId: string;
  side: Side;
  x: number;
  width: number;
  hp: number;
  maxHp: number;
  shield: number;
  /** Effective (modified) speed and damage. */
  speed: number;
  damage: number;
  modifiers: string[];
  state: string;
}

export interface SideSnapshot {
  gold: number;
  xp: number;
  age: number;
  baseHp: number;
  queue: QueuedUnit[];
  unlockedSlots: number;
  turrets: (TurretState | null)[];
  /** Gold per second from living money units. */
  incomePerSec: number;
  /** Side-wide modifiers as "id:mult". */
  sideModifiers: string[];
  /** Building levels (Phase 14). */
  buildings: Record<BuildingId, number>;
  /** Forge research tiers (Phase 14). */
  research: Record<ResearchId, number>;
}

export interface DebugSnapshot {
  phase: MatchPhase;
  elapsedMs: number;
  /** Who plays the enemy this match. */
  ai: AiDifficultyName | 'off';
  /** Set when an AI also plays the player's side (dev and tuning). */
  playerAi: AiDifficultyName | null;
  baseHp: Record<Side, number>;
  sides: Record<Side, SideSnapshot>;
  units: UnitSnapshot[];
}

export interface DebugHandle {
  state: MatchState;
  bus: typeof eventBus;
  /** Current match state and every unit on the lane. */
  snapshot(): DebugSnapshot;
  /** Spawns a unit for free if the spawn point is clear. Returns whether it did. */
  spawn(unitId: string, side: Side): boolean;
  /**
   * Runs `ms` of simulation immediately in fixed 60 Hz steps, without
   * rendering. Much faster than `setSpeed` for automated checks and tuning.
   */
  step(ms: number): void;
  /** Fingerprint of the battle right now (`systems/stateHash.ts`), and the tick it is at. */
  hash(): string;
  tick(): number;
  /** Lockstep multiplayer: the commands run so far, whether a desync was seen, whether the next tick may run. */
  lockstep(): { log: readonly TurnRecord[]; desynced: boolean; ready: boolean } | null;
  /** Starts a fresh match (the no-singletons rule makes this safe). */
  restart(data?: GameSceneData): void;
  /** Projectiles currently in flight. */
  projectileCount(): number;
  /** Projectile objects ever created by the pool (should level off). */
  projectilePoolSize(): number;
  /** Emits `buy-unit-requested`, exactly as a click on the buy panel does. */
  buy(unitId: string, side?: Side): void;
  /** Emits `buy-slot-requested` (unlock the next turret slot). */
  buySlot(side?: Side): void;
  /** Emits `buy-turret-requested`. */
  buyTurret(slotIndex: number, turretId: string, side?: Side): void;
  /** Emits `sell-turret-requested`. */
  sellTurret(slotIndex: number, side?: Side): void;
  /** Emits `upgrade-turret-requested`. */
  upgradeTurret(slotIndex: number, side?: Side): void;
  /** Emits `special-requested`. */
  special(side?: Side): void;
  /** Cheat: tops XP up to the threshold and ages up. Returns whether it did. */
  ageUp(side?: Side): boolean;
  /** Live stats of each turret slot (null = empty). */
  turretStats(side?: Side): ({ turretId: string; damage: number; cooldownMs: number; range: number } | null)[];
  /** Special cooldown left, in simulation ms (0 = ready). */
  specialRemainingMs(side?: Side): number;
  /**
   * Applies a stat modifier to a unit (by instance id), optionally for
   * `durationMs` of simulation time. Returns the modifier id, or null if the
   * unit is not on the lane.
   */
  modify(instanceId: number, stat: ModifiableStat, mult: number, durationMs?: number): string | null;
  /** Removes a modifier. Returns whether it was there. */
  unmodify(instanceId: number, modifierId: string): boolean;
  /** Deals damage to a unit through damageOps (credited to the other side). */
  damage(instanceId: number, amount: number): boolean;
  /** Kills a unit through damageOps (credited to the other side). Returns whether it did. */
  kill(instanceId: number): boolean;
  /** The account (Mech parts): open every part (or undo with false), or set the account XP. */
  unlockAll(on?: boolean): void;
  accountXp(xp: number): void;
  /** Moves a unit to lane x (set up fights for checks). */
  place(instanceId: number, x: number): boolean;
  /** Grants a shield to a unit. Returns its new shield. */
  shield(instanceId: number, amount: number): number;
  /** Sets a modifier on every unit of a side, including future spawns. */
  setSideModifier(side: Side, stat: ModifiableStat, mult: number, id?: string): void;
  clearSideModifier(side: Side, id: string): void;
  /** Cheat: adds gold through economyOps (default `DEBUG_CHEATS.gold`). */
  addGold(amount?: number, side?: Side): void;
  /** Cheat: adds XP through economyOps (default `DEBUG_CHEATS.xp`). */
  addXp(amount?: number, side?: Side): void;
  /** Fast-forward multiplier for the simulation (1 = normal). */
  setSpeed(multiplier: number): void;
  pause(): void;
  resume(): void;
  /** Deals damage to a base through damageOps (can end the match). */
  damageBase(side: Side, amount: number): void;
  /** Keys of the scenes currently running (menu, game, hud, overlay...). */
  activeScenes(): string[];
  /** Game objects in the game scene's display list (for leak checks). */
  displayCount(): number;
  /** What a side did so far this match (the game-over panel's numbers). */
  stats(side?: Side): SideStats;
  /** Emits `upgrade-building-requested` (builds at level 0). */
  upgradeBuilding(buildingId: BuildingId, side?: Side): void;
  /** Emits `research-requested`. */
  research(researchId: ResearchId, side?: Side): void;
  /** Bytes of texture memory held by the rig unit sheets right now. */
  rigArtBytes(): number;
  /** Slow motion for effects (tweens, particles, scene timers; 1 = normal), to review quick flashes. */
  fxTimeScale(scale: number): void;
}

declare global {
  interface Window {
    __aow?: DebugHandle;
  }
}

export function installDebugHandle(handle: DebugHandle): void {
  window.__aow = handle;
}

export function removeDebugHandle(): void {
  delete window.__aow;
}
