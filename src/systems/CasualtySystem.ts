import { UnitState, type Unit } from '@entities/Unit';
import type { UnitFactory } from '@entities/UnitFactory';
import { otherSide } from '@state/types';
import { emit, Events } from '@utils/EventBus';

/**
 * Clears the dead off the lane. Runs after every damage source each frame:
 * reports each unit marked dead (see `damageOps`) with `unit-died`, crediting
 * its killer, and hands it back to the pool.
 *
 * Emits: `unit-died`.
 */
export class CasualtySystem {
  private readonly units: UnitFactory;
  /** Reused between frames so collecting the dead allocates nothing. */
  private readonly dead: Unit[] = [];

  constructor(units: UnitFactory) {
    this.units = units;
  }

  update(): void {
    for (const unit of this.units.activeUnits) {
      if (unit.unitState === UnitState.Dead) this.dead.push(unit);
    }
    for (const unit of this.dead) {
      emit(Events.UnitDied, {
        side: unit.side,
        unitId: unit.definition.id,
        instanceId: unit.instanceId,
        killerSide: unit.killerSide ?? otherSide(unit.side),
        x: unit.x,
        ...(unit.killerTurret >= 0 ? { killerTurret: unit.killerTurret } : {}),
        ...(unit.retired ? { retired: true } : {}),
      });
      this.units.release(unit);
    }
    this.dead.length = 0;
  }
}
