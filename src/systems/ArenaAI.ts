import { ARENA_AI_PICK_MS, ARENA_AI_SPEND } from '@config/arena.config';
import { DEFAULT_MECH_DESIGN, MECH_DUEL } from '@config/mech.config';
import { designCost, randomDesign } from '@entities/mechDesign';
import type { MatchState } from '@state/GameState';
import type { Side } from '@state/types';
import { emit, Events } from '@utils/EventBus';
import { Rng } from '@utils/Rng';

/**
 * The Mech Arena's hangar for an AI side (offline, GAME_DESIGN 15): a while
 * into the hangar phase it picks a random fighting Mech costing about
 * `ARENA_AI_SPEND` of its gold, through `build-mech-requested` like a
 * player. (Farming is the normal AI; the fight uses MechDuelAI.)
 *
 * Emits: `build-mech-requested`.
 */
export class ArenaAI {
  private readonly state: MatchState;
  private readonly side: Side;
  private readonly rng: Rng;
  private pickedRound = 0;
  private hangarStart = -1;

  constructor(state: MatchState, side: Side) {
    this.state = state;
    this.side = side;
    this.rng = Rng.derive(state.seed, `arena-ai-${side}`);
  }

  update(nowMs: number): void {
    const arena = this.state.arena;
    if (!arena || arena.phase !== 'hangar') {
      this.hangarStart = -1;
      return;
    }
    if (this.hangarStart < 0) this.hangarStart = nowMs;
    if (this.pickedRound === arena.round || nowMs - this.hangarStart < ARENA_AI_PICK_MS) return;
    this.pickedRound = arena.round;
    const gold = this.state[this.side].gold;
    let design = randomDesign(() => this.rng.next(), arena.age, gold * ARENA_AI_SPEND, MECH_DUEL.costBand, MECH_DUEL.samples);
    if (designCost(design, arena.age) > gold) design = { ...DEFAULT_MECH_DESIGN };
    emit(Events.BuildMechRequested, { side: this.side, design });
  }
}
