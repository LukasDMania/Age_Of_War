import { AI_INCOME, type AiDifficulty } from '@config/ai.config';
import { getAge } from '@config/ages.config';
import { addGold, addXp } from '@state/economyOps';
import type { MatchState } from '@state/GameState';
import type { Side } from '@state/types';

/**
 * The AI's own income (Phase 15, owner's "option C"): an AI-played side earns
 * gold and XP every second regardless of kills, scaled by its age factor, a
 * ramp over match time and its difficulty's `incomeMult`. The AI still buys
 * everything through the normal `*-requested` events; this only fills its
 * purse, so it can't be starved into doing nothing.
 *
 * One instance per AI-played side. Listens for nothing.
 * Emits: `gold-changed` (source `ai-income`) and `xp-changed` through economyOps.
 */
export class AiIncomeSystem {
  private readonly state: MatchState;
  private readonly side: Side;
  private readonly difficulty: AiDifficulty;
  private goldCarry = 0;
  private xpCarry = 0;

  constructor(state: MatchState, side: Side, difficulty: AiDifficulty) {
    this.state = state;
    this.side = side;
    this.difficulty = difficulty;
  }

  /** Current gold/s, for the debug handle and logs. */
  goldPerSec(nowMs: number): number {
    return AI_INCOME.goldPerSec * this.factor(nowMs);
  }

  update(deltaMs: number, nowMs: number): void {
    const factor = this.factor(nowMs);
    this.goldCarry += (AI_INCOME.goldPerSec * factor * deltaMs) / 1000;
    this.xpCarry += (AI_INCOME.xpPerSec * factor * deltaMs) / 1000;
    const gold = Math.floor(this.goldCarry);
    if (gold > 0) {
      this.goldCarry -= gold;
      addGold(this.state, this.side, gold, 'ai-income');
    }
    const xp = Math.floor(this.xpCarry);
    if (xp > 0) {
      this.xpCarry -= xp;
      addXp(this.state, this.side, xp);
    }
  }

  private factor(nowMs: number): number {
    const ramp = AI_INCOME.rampMax * Math.min(1, nowMs / AI_INCOME.rampFullAtMs);
    return getAge(this.state[this.side].age).scale * (1 + ramp) * this.difficulty.incomeMult;
  }
}
