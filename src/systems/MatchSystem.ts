import type { MatchState } from '@state/GameState';
import type { MatchPhase } from '@state/types';
import { emit, Events, on } from '@utils/EventBus';

/**
 * Match state machine: pre-game -> playing <-> paused, and playing -> gameover.
 * Also keeps the simulation clock (`elapsedMs`), which only advances while
 * playing so cooldowns freeze during a pause.
 *
 * Listens for: `base-destroyed` (ends the match), `pause-requested`,
 * `resume-requested`.
 * Emits: `match-state-changed`.
 */
export class MatchSystem {
  /** Simulation time in ms, counted only while the match is playing. */
  elapsedMs = 0;
  /** Simulation ticks run so far (each `SIM_STEP_MS` long); lockstep schedules commands by tick. */
  tick = 0;

  private readonly state: MatchState;
  private readonly cleanups: (() => void)[];

  constructor(state: MatchState) {
    this.state = state;
    this.cleanups = [
      on(Events.BaseDestroyed, () => this.endMatch()),
      on(Events.PauseRequested, () => this.pause()),
      on(Events.ResumeRequested, () => this.resume()),
    ];
  }

  get phase(): MatchPhase {
    return this.state.phase;
  }

  start(): void {
    this.transition('playing');
  }

  pause(): void {
    if (this.state.phase === 'playing') this.transition('paused');
  }

  resume(): void {
    if (this.state.phase === 'paused') this.transition('playing');
  }

  togglePause(): void {
    if (this.state.phase === 'playing') this.pause();
    else if (this.state.phase === 'paused') this.resume();
  }

  /** Advances the simulation clock by one tick. */
  update(deltaMs: number): void {
    if (this.state.phase !== 'playing') return;
    this.elapsedMs += deltaMs;
    this.tick++;
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  private endMatch(): void {
    if (this.state.phase === 'playing') this.transition('gameover');
  }

  private transition(to: MatchPhase): void {
    const from = this.state.phase;
    if (!this.isLegal(from, to)) {
      throw new Error(`Illegal match transition: ${from} -> ${to}`);
    }
    this.state.phase = to;
    emit(Events.MatchStateChanged, { from, to });
  }

  private isLegal(from: MatchPhase, to: MatchPhase): boolean {
    switch (from) {
      case 'pre-game':
        return to === 'playing';
      case 'playing':
        return to === 'paused' || to === 'gameover';
      case 'paused':
        return to === 'playing';
      case 'gameover':
        return false;
    }
  }
}
