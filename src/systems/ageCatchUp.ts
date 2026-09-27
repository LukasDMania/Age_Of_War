import { feature } from '@config/features.config';
import type { MatchState } from '@state/GameState';
import { otherSide, type Side } from '@state/types';

/**
 * How many ages `side` is behind the other side, for the catch-up rules
 * (switch `ageCatchUp`, `AGE_CATCH_UP` and `AI_CATCH_UP_MS`); 0 when it
 * isn't behind or the switch is off. Read by EconomySystem (kill XP),
 * TurretSystem (turret damage), AiIncomeSystem and both AIs.
 */
export function ageGap(match: MatchState, side: Side): number {
  if (!feature('ageCatchUp')) return 0;
  return Math.max(0, match[otherSide(side)].age - match[side].age);
}
