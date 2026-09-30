import { MECH_DUEL } from '@config/mech.config';
import type { UnitFactory } from '@entities/UnitFactory';
import { isMechUnitId } from '@entities/mechDesign';
import type { MatchState } from '@state/GameState';
import { otherSide, type Side } from '@state/types';
import { emit, Events } from '@utils/EventBus';

/**
 * The enemy's side in Mech vs Mech (Mech expansion section 6): its Mech
 * walks and fights by the normal rules; this only fires its module, with
 * `mech-ability-requested` like the player, when the other Mech is within
 * `MECH_DUEL.enemyAbilityRange` and the module is ready. MechSystem checks
 * it like any request.
 *
 * Emits: `mech-ability-requested`.
 */
export class MechDuelAI {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly side: Side;

  constructor(state: MatchState, units: UnitFactory, side: Side = 'enemy') {
    this.state = state;
    this.units = units;
    this.side = side;
  }

  update(nowMs: number): void {
    const me = this.state[this.side].mech;
    if (!me.alive || nowMs < (me.abilityReadyAt ?? 0)) return;
    let mine = null;
    let theirs = null;
    for (const unit of this.units.activeUnits) {
      if (!unit.isAlive || !isMechUnitId(unit.definition.id)) continue;
      if (unit.side === this.side) mine = unit;
      else if (unit.side === otherSide(this.side)) theirs = unit;
    }
    if (!mine?.definition.mech?.ability || !theirs) return;
    if (Math.abs(mine.x - theirs.x) - mine.halfWidth - theirs.halfWidth > MECH_DUEL.enemyAbilityRange) return;
    emit(Events.MechAbilityRequested, { side: this.side });
  }
}
