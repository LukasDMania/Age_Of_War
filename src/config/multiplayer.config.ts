/**
 * Lockstep multiplayer tunables (Phase 22, 2026-10-05). All PROPOSED.
 *
 * Time is cut into turns of `TURN_TICKS` simulation ticks. At the start of
 * turn n each browser sends the commands given since the last turn start,
 * to run at the start of turn n + `INPUT_DELAY_TURNS` in both browsers;
 * that hides the network delay. So a click waits 2 to 3 turns (100-150 ms).
 * Each browser sends one message per turn (empty or not), and neither may
 * start a turn before it has the other's message for it.
 */

/** Ticks per turn: 3 ticks = 50 ms, 20 messages a second per player. */
export const TURN_TICKS = 3;

/** Turns between sending a turn's commands and running them: 2 turns = 100 ms the message has to arrive. */
export const INPUT_DELAY_TURNS = 2;

/** Every this many turns (5 s) both browsers send their state hash to catch a desync. */
export const HASH_EVERY_TURNS = 100;

/**
 * Most frame time a waiting browser saves up to catch up with once the
 * other's turn arrives (ms). More would make the game rush after a hiccup.
 */
export const MAX_CATCH_UP_MS = 250;
