/**
 * Mech Arena (owner, 2026-10-07; GAME_DESIGN 15 "Mech Arena"): farm, build a
 * Mech, fight; best of 3. Times are game ms (the game runs at `GAME_SPEED`
 * 2x, so 180_000 game ms is 90 real seconds). LOCKED by the owner: 90 s farm,
 * 30 s hangar, best of 3. Everything else PROPOSED.
 */

/** Round wins needed to take the match (best of 3). */
export const ARENA_WINS_NEEDED = 2;

export const ARENA_TIMES = {
  /** Farming: 90 real seconds. */
  farmMs: 180_000,
  /** Hangar: 30 real seconds. */
  hangarMs: 60_000,
  /** A fight still going after this (90 real s) goes to the higher HP share. */
  fightMaxMs: 180_000,
  /** Pause after a round is decided, before the next farm (shows the result). */
  roundEndMs: 6_000,
} as const;

/** Gold at the start of each farm, times the age's `scale`. */
export const ARENA_START_GOLD = 150;
/** Extra starting gold for the loser of the round before, times the age's `scale`. */
export const ARENA_LOSER_BONUS = 100;

/**
 * Farm layout (px). Raiders appear `raiderOffset` from the middle, each on
 * the side of the middle of the base it walks to, so the two streams walk
 * apart and never meet (units only look ahead). Players' units stop `holdFromMid` short of the
 * middle: the gap (2x) is wider than any unit's or turret's reach, so the two
 * farms never fight each other.
 */
export const ARENA_LANE = {
  raiderOffset: 30,
  holdFromMid: 120,
} as const;

/**
 * Raider waves, the same for both players. A wave every `everyMs`; it has
 * `1 + floor(wave / perExtra)` raiders, chosen in turn from the age's melee,
 * ranged and heavy units (heavies only from `heavyFrom` of the farm on).
 * They get tougher as the farm runs out: HP and damage up to x`maxStrength`
 * at the end. A kill pays `bountyMult` x the unit's normal bounty (the farm
 * has to pay for a Mech: the cheapest Stone one is 470, a typical one about
 * 2,100); one that reaches a base steals that much gold instead.
 */
export const ARENA_WAVES = {
  firstAtMs: 4_000,
  everyMs: 6_000,
  bountyMult: 4,
  perExtra: 5,
  /** Units appear `spacingMs` apart within a wave (so they don't stack). */
  spacingMs: 900,
  heavyFrom: 0.45,
  maxStrength: 1.6,
  /** Raider look: a purple tint. */
  tint: 0xc890ff,
} as const;

/** The AI picks a Mech around this share of its gold (offline opponent). */
export const ARENA_AI_SPEND = 0.85;
/** Game ms into the hangar before the AI picks. */
export const ARENA_AI_PICK_MS = 6_000;
