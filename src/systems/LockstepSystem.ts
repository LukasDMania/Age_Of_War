import { HASH_EVERY_TURNS, TURN_TICKS } from '@config/multiplayer.config';
import { BLOCKED_EVENTS, isCommandEvent, type Command, type NetMessage, type TurnMessage, type TurnRecord } from '@net/protocol';
import type { Transport } from '@net/transport';
import { otherSide, SIDES, type Side } from '@state/types';
import { emit, Events, setEventGate, type EventName } from '@utils/EventBus';

export interface LockstepOptions {
  /** The side this browser plays; null watches a replay (no input). */
  localSide: Side | null;
  /** The other player; null for a replay. */
  transport: Transport | null;
  /** Replay: the command log of an earlier match (both sides). */
  replay?: readonly TurnRecord[];
  /** Turns between sending commands and running them (`MatchSetup.inputDelayTurns`). */
  inputDelayTurns: number;
  /** The battle's state hash right now (`systems/stateHash.ts`). */
  hash: () => string;
}

/**
 * Lockstep multiplayer (Phase 22, 2026-10-05). Both browsers run the same
 * battle; only the players' commands travel.
 *
 * - Through the event bus gate it holds back every command request given
 *   outside a tick (clicks, keys) by the local side, and drops requests for
 *   the other side and those multiplayer forbids (`BLOCKED_EVENTS`).
 *   Requests made inside a tick (systems, AIs) pass: both browsers make them.
 * - Commands given during turn n - 1 are sent at the start of turn n, for
 *   turn n + the match's input delay (`MatchSetup.inputDelayTurns`).
 *   Each turn starts by running that turn's commands, player's side first,
 *   so both browsers run them on the same tick in the same order.
 * - A turn may start only when both sides' messages for it are in
 *   (`ready`); GameScene waits otherwise.
 * - Every `HASH_EVERY_TURNS` the state hash goes along; a mismatch emits
 *   `desync-detected` once.
 *
 * Listens for: every event, through `setEventGate`.
 * Emits: the commands (at their turn), `desync-detected`.
 */
export class LockstepSystem {
  /** Commands run so far, both sides, non-empty turns only (a replay feeds this back). */
  readonly log: TurnRecord[] = [];
  desynced = false;
  /** Hash pairs compared so far (checks: the exchange works). */
  hashesCompared = 0;

  private readonly localSide: Side | null;
  private readonly transport: Transport | null;
  private readonly hash: () => string;
  private readonly inputDelayTurns: number;
  private readonly replay: boolean;
  /** Commands given this turn, sent at the next turn start. */
  private pending: Command[] = [];
  private readonly turns = new Map<number, Partial<Record<Side, Command[]>>>();
  private readonly localHashes = new Map<number, string>();
  private readonly remoteHashes = new Map<number, string>();
  /** True while a tick (or a turn's commands) runs: requests then are the simulation's own. */
  private simulating = false;
  private readonly offMessage: () => void;

  constructor(options: LockstepOptions) {
    this.localSide = options.localSide;
    this.transport = options.transport;
    this.hash = options.hash;
    this.replay = options.replay !== undefined;
    // The first turns run before any message could arrive: nobody has commands for them.
    this.inputDelayTurns = options.inputDelayTurns;
    for (let turn = 0; turn < this.inputDelayTurns; turn++) this.turns.set(turn, { player: [], enemy: [] });
    for (const record of options.replay ?? []) this.record(record.turn, record.side, record.commands);
    this.offMessage = this.transport?.onMessage((message) => this.receive(message)) ?? (() => undefined);
    setEventGate((event, payload) => this.gate(event, payload));
  }

  /** The turn tick `tick` belongs to. */
  static turnOf(tick: number): number {
    return Math.floor(tick / TURN_TICKS);
  }

  /** Whether tick `tick` may run: a turn's first tick needs both sides' messages for that turn. */
  ready(tick: number): boolean {
    if (tick % TURN_TICKS !== 0 || this.replay) return true;
    const turn = this.turns.get(tick / TURN_TICKS);
    return turn !== undefined && SIDES.every((side) => turn[side] !== undefined);
  }

  /** Runs one tick (`step`), starting a turn first when `tick` is a turn's first tick. */
  runTick(tick: number, step: () => void): void {
    this.simulating = true;
    try {
      if (tick % TURN_TICKS === 0) this.startTurn(tick / TURN_TICKS);
      step();
    } finally {
      this.simulating = false;
    }
  }

  destroy(): void {
    setEventGate(null);
    this.offMessage();
    this.transport?.close();
  }

  private gate(event: EventName, payload: unknown): boolean {
    if (this.simulating) return false;
    if (isCommandEvent(event)) {
      const command = { e: event, p: JSON.parse(JSON.stringify(payload)) } as Command;
      if (this.localSide !== null && command.p.side === this.localSide) this.pending.push(command);
      return true;
    }
    return BLOCKED_EVENTS.includes(event);
  }

  private startTurn(turn: number): void {
    if (this.localSide !== null && this.transport) {
      const message: TurnMessage = { kind: 'turn', turn: turn + this.inputDelayTurns, commands: this.pending };
      this.pending = [];
      this.record(message.turn, this.localSide, message.commands);
      if (turn % HASH_EVERY_TURNS === 0) {
        const value = this.hash();
        this.localHashes.set(turn, value);
        message.hash = { turn, value };
        this.compareHashes(turn);
      }
      this.transport.send(message);
    }
    const commands = this.turns.get(turn);
    this.turns.delete(turn);
    if (!commands) return;
    for (const side of SIDES) {
      const list = commands[side] ?? [];
      if (list.length > 0) this.log.push({ turn, side, commands: list });
      for (const command of list) emit(command.e, command.p);
    }
  }

  private receive(message: NetMessage): void {
    if (message.kind !== 'turn' || this.localSide === null) return;
    const remote = otherSide(this.localSide);
    // A peer only ever commands its own side, with known requests.
    const commands = message.commands
      .filter((command) => isCommandEvent(command.e))
      .map((command) => ({ e: command.e, p: { ...command.p, side: remote } }) as Command);
    this.record(message.turn, remote, commands);
    if (message.hash) {
      this.remoteHashes.set(message.hash.turn, message.hash.value);
      this.compareHashes(message.hash.turn);
    }
  }

  private record(turn: number, side: Side, commands: Command[]): void {
    const entry = this.turns.get(turn) ?? {};
    entry[side] = [...(entry[side] ?? []), ...commands];
    this.turns.set(turn, entry);
  }

  private compareHashes(turn: number): void {
    const local = this.localHashes.get(turn);
    const remote = this.remoteHashes.get(turn);
    if (local === undefined || remote === undefined) return;
    this.localHashes.delete(turn);
    this.remoteHashes.delete(turn);
    this.hashesCompared++;
    if (local !== remote && !this.desynced) {
      this.desynced = true;
      emit(Events.DesyncDetected, { turn, local, remote });
    }
  }
}
