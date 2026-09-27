/**
 * Global tunables. Anything a designer might want to tweak lives here or in
 * a sibling config file, not as a literal inside a system.
 *
 * Values tagged PROPOSED in docs/GAME_DESIGN.md are unconfirmed defaults;
 * change them freely, and note it in the session log.
 */
import type { Side } from '@state/types';

/* ---- Canvas and layout ------------------------------------------------ */

/** Logical canvas size. Phaser scales this to fit the window. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** Y coordinate of the single lane that both armies walk along. */
export const LANE_Y = 560;

/** Horizontal center of each base. Enemy mirrors the player. */
export const BASE_X: Record<Side, number> = {
  player: 120,
  enemy: GAME_WIDTH - 120,
};

/**
 * How far from its base's center (toward the lane center) a unit appears.
 * PROPOSED. Kept inside the base (the placeholder base is 120 px wide, so its
 * front edge is 60 px out) so enemy units standing at the gate can never
 * block the spawn point; units walk out of the gate instead. Was 110 (in
 * front of the base) until Phase 3, which let enemies at the gate stop a
 * side from spawning anything at all.
 */
export const UNIT_SPAWN_OFFSET_X = 20;

/** Where each side's units appear (inside the gate of its own base). */
export const SPAWN_X: Record<Side, number> = {
  player: BASE_X.player + UNIT_SPAWN_OFFSET_X,
  enemy: BASE_X.enemy - UNIT_SPAWN_OFFSET_X,
};

/** Minimum gap in pixels between the bodies of neighbouring units. */
export const UNIT_SPACING_PX = 4;

/**
 * PROPOSED (Phase 9). Support units (money and utility units, the ones
 * without an attack) don't lead: they follow the front-most friendly combat
 * unit and stay this many px behind its back, and they never block (or get
 * blocked by) friendly units. With no friendly combat unit on the lane they
 * wait at `SUPPORT_RALLY_OFFSET` px in front of their spawn point. Several
 * support units of the same kind line up behind each other, each
 * `SUPPORT_STAGGER` px further back than the one spawned before it.
 */
export const SUPPORT_TRAIL_GAP: Record<'economy' | 'utility', number> = {
  economy: 140,
  utility: 40,
};
export const SUPPORT_RALLY_OFFSET = 120;
export const SUPPORT_STAGGER = 38;

/**
 * Longest frame time the simulation will accept. Stops a background tab or a
 * slow frame from teleporting units when the game resumes.
 */
export const MAX_FRAME_DELTA_MS = 100;

/* ---- Match start ------------------------------------------------------ */

/** PROPOSED. Starting hit points of each base. */
export const BASE_HP = 1000;

/**
 * Base max HP per age (owner, 2026-09-26: base HP goes up with each age).
 * On age-up the base gains the difference, so damage already taken stays.
 * PROPOSED numbers.
 */
export const BASE_HP_BY_AGE: readonly number[] = [1000, 1500, 2100, 2800, 3600];

export function baseMaxHp(age: number): number {
  return BASE_HP_BY_AGE[age] ?? BASE_HP;
}

/**
 * Multipliers on every kill's gold and XP (Phase 15). Kill gold was set to
 * ~1.2x a unit's cost when kills were the only income; with Mines and the
 * AI's own income, killing a stream of enemies at a turret line paid far
 * more than it cost (one logged match: 570k kill gold), so defense farmed
 * endless gold and XP. PROPOSED.
 */
export const KILL_GOLD_MULT = 0.5;
export const KILL_XP_MULT = 0.6;

/** PROPOSED. Enough for a couple of early units. */
export const STARTING_GOLD = 100;
export const STARTING_XP = 0;

/*
 * Passive income (Phase 13) was removed in Phase 14 (owner, 2026-09-26):
 * the Mine building replaces it. See `config/buildings.config.ts`.
 */

/* ---- Economy and unit training (Phase 3) ------------------------------ */

/**
 * PROPOSED. Most units a side can have queued for training at once, counting
 * the one currently in training (the original game used 5). Units train one
 * at a time, in order, each taking its definition's `trainTimeMs`. Gold is
 * paid when the unit is queued.
 */
export const UNIT_QUEUE_LIMIT = 5;

/**
 * Money units (Phase 9). Each living money unit multiplies the damage and
 * speed of its side's other units by its `allyPenalty` (0.9 today); the
 * product never goes below this floor. PROPOSED, from the design doc.
 */
export const ECONOMY_PENALTY_FLOOR = 0.5;

/**
 * Multiplier on the kill gold for killing a money unit, so the enemy is
 * tempted to hunt them. 1 = no bonus (their kill gold is already 1.2x their
 * high price). PROPOSED. With the money-unit rework switched on
 * (`features.config` `moneyUnitRework`) `MONEY_UNIT_REWORK.bountyMult` is
 * used instead.
 */
export const ECONOMY_KILL_BOUNTY_MULT = 1;

/**
 * Money-unit rework (owner, 2026-09-27: "money units rarely are valuable?
 * make them more useful but not always easy money"). PROPOSED, switchable.
 *
 * - `ramp`: a money unit's income starts at `startMult` x its
 *   `goldPerSecond` and grows evenly to `maxMult` x after `fullAtMs` alive.
 *   A trader that dies early earns little; one kept alive a minute pays
 *   back its price and then earns double.
 * - `loot`: an enemy that dies within `radius` px of a living friendly money
 *   unit pays `bonusPerUnit` more kill gold per such money unit (at most
 *   `maxBonus`): they haggle over the spoils, so they are worth keeping
 *   close behind a strong line.
 * - `bountyMult`: the enemy's reward for killing one (was 1: their kill
 *   gold is 1.2x their price, a double loss).
 */
export const MONEY_UNIT_REWORK = {
  ramp: { startMult: 0.5, maxMult: 2, fullAtMs: 60_000 },
  loot: { radius: 170, bonusPerUnit: 0.35, maxBonus: 1 },
  bountyMult: 0.5,
} as const;

/**
 * Utility auras (Phase 10): how often slow and buff auras refresh their
 * modifiers, how long a buff lingers after a unit leaves the radius, and how
 * often auras show a visual pulse.
 */
export const UTILITY_AURA_TICK_MS = 250;
export const UTILITY_BUFF_LINGER_MS = 600;
export const UTILITY_AURA_PULSE_MS = 1500;

/** Dev-only cheat amounts (`window.__aow`, and the G / X keys). */
export const DEBUG_CHEATS = {
  gold: 100,
  xp: 100,
} as const;

/* ---- Turrets (Phase 5) ------------------------------------------------- */

/** PROPOSED. Slots unlocked at the start, and the maximum. */
export const STARTING_TURRET_SLOTS = 1;
export const MAX_TURRET_SLOTS = 5;

/**
 * PROPOSED. Gold to unlock each slot, by slot index. Slot 0 starts unlocked;
 * slots must be unlocked in order, each costing more than the last.
 */
// Owner, 2026-09-26: all five slots were too easy to get; was [0, 100, 200, 350, 550].
export const TURRET_SLOT_UNLOCK_COSTS: readonly number[] = [0, 250, 900, 2500, 6000];

/** PROPOSED. Share of a turret's purchase price refunded when it is sold. */
export const TURRET_SELL_REFUND = 0.5;

/** PROPOSED. Share of the gold spent on its upgrades (Phase 11) refunded on sale. */
export const TURRET_UPGRADE_REFUND = 0.25;

/**
 * Where turret slots sit on a base: a column up the base's front edge.
 * `offsetX` is from the base center toward the lane; `firstY` is the bottom
 * of slot 0; each next slot is `spacingY` higher.
 */
export const TURRET_SLOT_LAYOUT = {
  offsetX: 44,
  firstY: LANE_Y - 74,
  spacingY: 42,
} as const;

/* ---- Scenes and Phase 0 visuals --------------------------------------- */

/** Scene keys, defined once so scenes never rely on stray string literals. */
export const SCENE_KEYS = {
  boot: 'BootScene',
  preload: 'PreloadScene',
  /** Title screen with the difficulty choice (Phase 13). */
  menu: 'MenuScene',
  game: 'GameScene',
  /** HUD, run in parallel on top of the game scene (Phase 3). */
  hud: 'HUDScene',
  /** Pause and game-over panel, on top of the HUD (Phase 13). */
  overlay: 'OverlayScene',
  /** Conquest campaign screen (prototype, feature `conquest`). */
  conquest: 'ConquestScene',
  /** Dev-only texture viewer, reachable with `?gallery` in the URL. */
  gallery: 'TextureGalleryScene',
} as const;

/** Color of the lane line. Sky and ground colors are per age (`AgeConfig.visuals`). */
export const LANE_COLOR = 0x3b2f2f;

/* ---- Game feel (Phase 13) ---------------------------------------------- */

/*
 * Screen shake (Phase 13) was replaced on 2026-09-26 by the graceful camera
 * "thump" (owner: a more graceful impact shake for the heavy units); its
 * tunables are `CAMERA_THUMP` in `config/effects.config.ts`.
 */

/** Real time between a base falling and the game-over panel, in ms. */
export const GAME_OVER_DELAY_MS = 1200;

/** How long the age-up banner stays on screen, in ms. */
export const AGE_BANNER_MS = 2400;

/** Playtest game speeds (Phase 14): the HUD button and the F key cycle through these. */
export const GAME_SPEEDS: readonly number[] = [1, 2, 3, 4, 8];

/**
 * Every unit walks at this speed (owner, 2026-09-26: "movement speed should
 * be equal between all for now", so gaps between units stay as they are and
 * lines only form when the front stops). Replaces each unit's own `speed`;
 * slows and the money-unit penalty still apply on top. PROPOSED value.
 */
export const UNIT_WALK_SPEED = 45;

/**
 * Most own units that may stand stacked on the spawn point (owner,
 * 2026-09-26: under pressure at your gate you can stack a few units instead
 * of waiting for the one in front to die). Enemy units at the gate still
 * block spawning.
 */
export const SPAWN_STACK_MAX = 4;

/** All turret damage x this (owner, 2026-09-26: turrets still too strong). PROPOSED. */
export const TURRET_DAMAGE_MULT = 0.7;


/**
 * Catch-up for the side that is behind in age (owner, 2026-09-27: "I often
 * go ahead in age before the enemy, then it's basically over for them").
 * PROPOSED, switch `ageCatchUp`. Per age behind the other side:
 * - `killXpPerAge`: XP from kills +this share (both sides);
 * - `turretDamagePerAge`: turret damage +this share (both sides), so the
 *   base can hold while the side catches up.
 * The AI part (its catch-up XP, no age-up delay) is in `ai.config.ts`.
 */
export const AGE_CATCH_UP = { killXpPerAge: 0.5, turretDamagePerAge: 0.35 } as const;
