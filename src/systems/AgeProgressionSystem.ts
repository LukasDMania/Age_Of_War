import { getAge, isFinalAge } from '@config/ages.config';
import type { Base } from '@entities/Base';
import { spendXp } from '@state/economyOps';
import type { MatchState } from '@state/GameState';
import type { Side } from '@state/types';
import { emit, Events, on } from '@utils/EventBus';

/** Why an age-up was turned down. */
export type AgeUpRejection = 'not-playing' | 'final-age' | 'not-enough-xp';

/**
 * Advancing through the ages (Phase 8). An age-up costs the current age's
 * `xpToNext`, which is spent (any XP above it carries over). The side's age
 * index goes up by one: from then on it buys that age's units, turrets and
 * special. Units already on the lane keep fighting, units already queued
 * still train (they were paid for), and built turrets keep their old stats.
 * The base changes its look.
 *
 * Listens for: `age-up-requested`.
 * Emits: `age-changed`; `xp-changed` through economyOps (after the age has
 * changed, so it already carries the new age's `xpToNext`).
 */
export class AgeProgressionSystem {
  private readonly state: MatchState;
  private readonly bases: Record<Side, Base>;
  private readonly unsubscribe: () => void;

  constructor(state: MatchState, bases: Record<Side, Base>) {
    this.state = state;
    this.bases = bases;
    this.unsubscribe = on(Events.AgeUpRequested, ({ side }) => this.onRequested(side));
  }

  rejectionFor(side: Side): AgeUpRejection | null {
    if (this.state.phase !== 'playing') return 'not-playing';
    const sideState = this.state[side];
    const cost = getAge(sideState.age).xpToNext;
    if (cost === null || isFinalAge(sideState.age)) return 'final-age';
    if (sideState.xp < cost) return 'not-enough-xp';
    return null;
  }

  destroy(): void {
    this.unsubscribe();
  }

  private onRequested(side: Side): void {
    if (this.rejectionFor(side) !== null) return;
    const sideState = this.state[side];
    const from = sideState.age;
    const cost = getAge(from).xpToNext;
    if (cost === null) return;
    sideState.age = from + 1;
    if (!spendXp(this.state, side, cost)) {
      sideState.age = from;
      return;
    }
    this.bases[side].setAge(sideState.age);
    emit(Events.AgeChanged, { side, age: sideState.age });
  }
}
