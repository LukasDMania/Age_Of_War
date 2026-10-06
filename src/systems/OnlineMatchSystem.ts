import { RECONNECT_WINDOW_MS, STALL_NOTICE_MS } from '@config/multiplayer.config';
import type { LinkStatus } from '@net/RelayClient';
import { emit, Events, on, type EventPayloads } from '@utils/EventBus';

type OnlineStatus = EventPayloads[typeof Events.OnlineStatusChanged]['status'];

/** Where connection news comes from (the RelayClient). */
export interface OnlineLink {
  onStatus(handler: (status: LinkStatus) => void): () => void;
}

/** Ends the match: `won` from this browser's side, null for no result. */
export type OnlineEnd = (won: boolean | null, note: string) => void;

/**
 * An online match's connection rules (Phase 22 step 3; owner 2026-10-05:
 * pause, then forfeit). Runs on real time, outside the battle: what it
 * decides ends the match in this browser only, and only when the two can no
 * longer play on together.
 *
 * - The opponent's connection drops: the battle stops by itself (lockstep
 *   waits for their turns); after `RECONNECT_WINDOW_MS` without them back,
 *   they forfeit.
 * - Ours drops: the RelayClient tries to get back; when it gives up, we lose.
 * - The opponent quits: they forfeit.
 * - A desync: no result.
 * - Turns late for over `STALL_NOTICE_MS`: "waiting for opponent".
 *
 * Listens for: `desync-detected`, the link's status.
 * Emits: `online-status-changed`.
 */
export class OnlineMatchSystem {
  private opponentLeftAt = 0;
  private reconnectingAt = 0;
  private stalledAt = 0;
  private last: { status: OnlineStatus; secondsLeft: number } = { status: 'ok', secondsLeft: 0 };
  private ended = false;
  private readonly end: OnlineEnd;
  private readonly cleanups: (() => void)[];

  constructor(link: OnlineLink, end: OnlineEnd) {
    this.end = end;
    this.cleanups = [
      link.onStatus((status) => this.onLink(status)),
      on(Events.DesyncDetected, () => this.finish(null, 'The two games went out of sync.')),
    ];
  }

  /** Each frame: `stalled` when the battle is waiting for the opponent's turn. */
  update(realNow: number, stalled: boolean): void {
    if (this.ended) return;
    if (!stalled) this.stalledAt = 0;
    else if (this.stalledAt === 0) this.stalledAt = realNow;
    if (this.opponentLeftAt > 0 && realNow - this.opponentLeftAt > RECONNECT_WINDOW_MS) {
      this.finish(true, 'Your opponent lost their connection.');
      return;
    }
    let status: OnlineStatus = 'ok';
    let since = 0;
    if (this.reconnectingAt > 0) [status, since] = ['reconnecting', this.reconnectingAt];
    else if (this.opponentLeftAt > 0) [status, since] = ['opponent-left', this.opponentLeftAt];
    else if (this.stalledAt > 0 && realNow - this.stalledAt > STALL_NOTICE_MS) status = 'waiting';
    const secondsLeft = since > 0 ? Math.max(0, Math.ceil((RECONNECT_WINDOW_MS - (realNow - since)) / 1000)) : 0;
    if (status !== this.last.status || secondsLeft !== this.last.secondsLeft) {
      this.last = { status, secondsLeft };
      emit(Events.OnlineStatusChanged, this.last);
    }
  }

  /** The match ended on the lane (a base fell): nothing more to decide. */
  matchOver(): void {
    this.ended = true;
    if (this.last.status !== 'ok') emit(Events.OnlineStatusChanged, { status: 'ok', secondsLeft: 0 });
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  private onLink(status: LinkStatus): void {
    const now = performance.now();
    switch (status) {
      case 'peer-left':
        this.opponentLeftAt = now;
        return;
      case 'peer-back':
        this.opponentLeftAt = 0;
        return;
      case 'peer-quit':
        this.finish(true, 'Your opponent left the match.');
        return;
      case 'reconnecting':
        this.reconnectingAt = now;
        return;
      case 'reconnected':
        this.reconnectingAt = 0;
        return;
      case 'lost':
        this.finish(false, 'Your connection was lost.');
        return;
      default:
        return;
    }
  }

  private finish(won: boolean | null, note: string): void {
    if (this.ended) return;
    this.matchOver();
    this.end(won, note);
  }
}
