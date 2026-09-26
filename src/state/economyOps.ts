/**
 * The only way gold and XP change. Each helper mutates one side of the
 * `MatchState` and emits the matching notification, so any system (or the
 * AI, or a dev cheat) can pay or earn without holding a reference to another
 * system. Never assign to `gold` or `xp` anywhere else.
 *
 * Gold may hold fractions (economy units in Phase 9 earn per second); the HUD
 * rounds down for display. Amounts must be finite and not negative: a bad
 * amount is a bug, so it throws rather than being ignored.
 *
 * Emits: `gold-changed`, `xp-changed`.
 */
import { getAge } from '@config/ages.config';
import type { MatchState } from '@state/GameState';
import type { Side } from '@state/types';
import { emit, Events, type GoldSource } from '@utils/EventBus';

function assertAmount(amount: number, what: string): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid ${what} amount: ${amount}`);
  }
}

/** XP needed to leave the side's current age, or null in the final age. */
export function xpToNextAge(match: MatchState, side: Side): number | null {
  return getAge(match[side].age).xpToNext;
}

export function canAfford(match: MatchState, side: Side, amount: number): boolean {
  return match[side].gold >= amount;
}

/** Adds gold and emits `gold-changed` with a positive delta. */
export function addGold(
  match: MatchState,
  side: Side,
  amount: number,
  source: GoldSource,
): void {
  assertAmount(amount, 'gold');
  if (amount === 0) return;
  const sideState = match[side];
  sideState.gold += amount;
  emit(Events.GoldChanged, { side, gold: sideState.gold, delta: amount, source });
}

/**
 * Spends gold if the side can afford it. Returns whether it did; on success
 * emits `gold-changed` with a negative delta.
 */
export function trySpendGold(
  match: MatchState,
  side: Side,
  amount: number,
  source: GoldSource = 'purchase',
): boolean {
  assertAmount(amount, 'gold');
  const sideState = match[side];
  if (sideState.gold < amount) return false;
  if (amount === 0) return true;
  sideState.gold -= amount;
  emit(Events.GoldChanged, { side, gold: sideState.gold, delta: -amount, source });
  return true;
}

/** Adds XP and emits `xp-changed`. */
export function addXp(match: MatchState, side: Side, amount: number): void {
  assertAmount(amount, 'XP');
  if (amount === 0) return;
  const sideState = match[side];
  sideState.xp += amount;
  emit(Events.XpChanged, { side, xp: sideState.xp, xpToNext: xpToNextAge(match, side) });
}

/**
 * Spends XP (age-ups, Phase 8) if the side has enough. Returns whether it
 * did; on success emits `xp-changed`.
 */
export function spendXp(match: MatchState, side: Side, amount: number): boolean {
  assertAmount(amount, 'XP');
  const sideState = match[side];
  if (sideState.xp < amount) return false;
  if (amount === 0) return true;
  sideState.xp -= amount;
  emit(Events.XpChanged, { side, xp: sideState.xp, xpToNext: xpToNextAge(match, side) });
  return true;
}
