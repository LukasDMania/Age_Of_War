import { GAME_SPEED, SIM_STEP_MS } from '@config/constants';

/**
 * Lockstep multiplayer tunables (Phase 22). All PROPOSED.
 *
 * Time is cut into turns of `TURN_TICKS` simulation ticks. At the start of
 * turn n each browser sends the commands given since the last turn start,
 * to run at the start of turn n + the match's input delay (in turns) in
 * both browsers; that hides the network delay. A click therefore waits
 * between `delay` and `delay + 1` turns. Each browser sends one message per
 * turn (empty or not), and neither may start a turn before it has the
 * other's message for it, so a delay shorter than the network needs makes
 * both games hitch until messages catch up.
 */

/** Ticks per turn: 4 ticks = 67 ms of game time, 33 real ms at the 2x standard speed (30 messages a second per player). */
export const TURN_TICKS = 4;

/** One turn in real ms. */
export const TURN_REAL_MS = (TURN_TICKS * SIM_STEP_MS) / GAME_SPEED;

/**
 * Input delay in turns: picked per match from the ping the lobby measures
 * (`inputDelayFor`), so a LAN game gets 1 turn (a click lands after 33-67
 * ms) and a typical internet game 2-3 (67-133 ms).
 */
export const INPUT_DELAY = { min: 1, max: 8, default: 2 } as const;

/** Slack on top of the one-way trip for jitter (ms). */
export const DELAY_MARGIN_MS = 20;

/** The input delay (turns) for a measured round trip: the one-way trip plus a margin must fit in it. */
export function inputDelayFor(roundTripMs: number): number {
  const turns = Math.ceil((roundTripMs / 2 + DELAY_MARGIN_MS) / TURN_REAL_MS);
  return Math.min(INPUT_DELAY.max, Math.max(INPUT_DELAY.min, turns));
}

/** Every this many turns (5 real s) both browsers send their state hash to catch a desync. */
export const HASH_EVERY_TURNS = 150;

/**
 * Most frame time a waiting browser saves up to catch up with once the
 * other's turn arrives (real ms). More would make the game rush after a hiccup.
 */
export const MAX_CATCH_UP_MS = 250;

/** How long the game waits on a missing turn before it says "waiting for opponent" (real ms). */
export const STALL_NOTICE_MS = 400;

/**
 * A lost connection: both games stop and wait this long (real ms) for the
 * player to come back; after that the missing player forfeits (owner,
 * 2026-10-05: pause, then forfeit; the 30 s is PROPOSED).
 */
export const RECONNECT_WINDOW_MS = 30_000;

/**
 * The local relay's port (`npm run relay`). The lobby connects to this port
 * on the machine the game was loaded from, unless `?relay=ws://...` says
 * otherwise.
 */
export const RELAY_PORT = 8787;

/** Pings the host sends in the lobby to measure the round trip. */
export const LOBBY_PINGS = 5;
