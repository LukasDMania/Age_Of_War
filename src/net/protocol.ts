import type { FeatureId } from '@config/features.config';
import type { Side } from '@state/types';
import { Events, type EventName, type EventPayloads } from '@utils/EventBus';

/**
 * Lockstep multiplayer messages (Phase 22, 2026-10-05). Everything here is
 * plain JSON, so it can go over any transport (loopback, WebSocket relay).
 */

/**
 * The requests a player gives that change the battle. In a lockstep match
 * they don't act when given: they become commands that run a few ticks
 * later in both browsers (`LockstepSystem`). Each payload carries `side`.
 */
export const COMMAND_EVENTS = [
  Events.BuyUnitRequested,
  Events.QueueArmyRequested,
  Events.BuildMechRequested,
  Events.MechAbilityRequested,
  Events.MechAssistRequested,
  Events.BuySlotRequested,
  Events.BuyTurretRequested,
  Events.UpgradeTurretRequested,
  Events.SellTurretRequested,
  Events.AgeUpRequested,
  Events.SpecialRequested,
  Events.UpgradeBuildingRequested,
  Events.ResearchRequested,
  Events.ChoosePerkRequested,
  Events.ChooseDoctrineRequested,
  Events.WarCryRequested,
] as const satisfies readonly EventName[];

export type CommandEvent = (typeof COMMAND_EVENTS)[number];

/** Requests a lockstep match ignores: one browser can't pause, speed up or restart the shared battle. */
export const BLOCKED_EVENTS: readonly EventName[] = [
  Events.PauseRequested,
  Events.ResumeRequested,
  Events.RestartRequested,
  Events.GameSpeedRequested,
];

/** One player command: the request and its payload. */
export interface Command {
  e: CommandEvent;
  p: EventPayloads[CommandEvent];
}

/**
 * Everything both browsers must agree on before the first tick. The host
 * makes it and sends it (step 3); the guest starts from the same one.
 */
export interface MatchSetup {
  seed: number;
  /** Turns between sending commands and running them, from the lobby's ping (`inputDelayFor`). */
  inputDelayTurns: number;
  /** The host's experiment switches (owner, 2026-10-05). */
  features: Record<FeatureId, boolean>;
  /**
   * Mech parts each side may not build: each player's own account locks in
   * a normal battle; none in Mech vs Mech, where every part is open (owner,
   * 2026-10-05).
   */
  mechLocked: Record<Side, string[]>;
  /** Mech Arena (GAME_DESIGN 15): farm, hangar, fight in this age, best of 3. */
  arena?: { age: number };
}

/**
 * A side's commands for one turn. Sent once per turn even when empty: the
 * message itself is the permission to run that turn. Every
 * `HASH_EVERY_TURNS` it also carries the sender's state hash at the start of
 * an earlier turn.
 */
export interface TurnMessage {
  kind: 'turn';
  turn: number;
  commands: Command[];
  hash?: { turn: number; value: string };
}

/** Lobby: the guest introduces itself (its own Mech locks for a normal battle). */
export interface HelloMessage {
  kind: 'hello';
  version: number;
  mechLocked: string[];
}

/** Lobby: the host starts the match; both start from this setup. */
export interface SetupMessage {
  kind: 'setup';
  setup: MatchSetup;
}

/** Lobby: the host measures the round trip to pick the input delay. */
export interface PingMessage {
  kind: 'ping' | 'pong';
  id: number;
}

/** Lobby: what the host chose (sent once the guest is in): a normal battle, or the Mech Arena ('duel') in an age. */
export interface LobbyMessage {
  kind: 'lobby';
  mode: 'battle' | 'duel';
  age: number;
}

export type NetMessage = TurnMessage | HelloMessage | SetupMessage | PingMessage | LobbyMessage;

/** Both browsers must run the same game build; bumped when messages or rules change (2: the Mech Arena). */
export const PROTOCOL_VERSION = 2;

/** A side's commands for one turn, as run (a match's command log, for replays). */
export interface TurnRecord {
  turn: number;
  side: Side;
  commands: Command[];
}

const COMMAND_SET: ReadonlySet<string> = new Set(COMMAND_EVENTS);

export function isCommandEvent(event: string): event is CommandEvent {
  return COMMAND_SET.has(event);
}
