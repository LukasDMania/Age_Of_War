import { SPAWN_STACK_MAX, SPAWN_X, UNIT_SPACING_PX } from '@config/constants';
import type { Base } from '@entities/Base';
import { UnitState, type Unit } from '@entities/Unit';
import type { UnitFactory } from '@entities/UnitFactory';
import { laneDir, otherSide, type Side } from '@state/types';

/**
 * Movement along the lane, including blocking. Units that are not fighting
 * walk toward the enemy base, but never through another unit (friend or foe)
 * and never into the enemy base, so they queue up in one row behind whatever
 * is in front of them.
 *
 * Every unit follows the same rule (owner, 2026-09-26): money and utility
 * units walk and queue like a clubman without an attack. Until then they
 * phased through friendly units and trailed behind the army.
 *
 * `CombatSystem` runs first each frame and marks units `Attacking` or
 * `Walking`; this system then moves the walkers (and marks those that could
 * not move as `Idle`). Attacking units stand still, except ranged units,
 * which keep closing up behind the friendly unit in front while they shoot.
 *
 * No events: movement is not something other systems need to hear about.
 */
export class LaneSystem {
  private readonly units: UnitFactory;
  private readonly bases: Record<Side, Base>;

  constructor(units: UnitFactory, bases: Record<Side, Base>) {
    this.units = units;
    this.bases = bases;
  }

  /** `deltaMs` is simulation time. */
  update(deltaMs: number): void {
    for (const unit of this.units.activeUnits) {
      // Leaping units and utility Mechs are moved by MechSystem.
      if (unit.airborne || unit.offLane) continue;
      if (unit.unitState === UnitState.Attacking) {
        this.closeRanks(unit, deltaMs);
        continue;
      }
      if (unit.unitState !== UnitState.Walking && unit.unitState !== UnitState.Idle) {
        continue;
      }
      const dir = laneDir(unit.side);
      const wanted = (unit.getStat('speed') * deltaMs) / 1000;
      const advance = Math.min(wanted, this.roomAhead(unit));
      if (advance > 0.01) {
        unit.x += dir * advance;
        unit.unitState = UnitState.Walking;
      } else {
        unit.unitState = UnitState.Idle;
      }
    }
  }

  /**
   * True when a unit of the given sprite width can appear at `side`'s spawn
   * point: no enemy there, and fewer than `SPAWN_STACK_MAX` own units
   * overlapping it (a small stack is allowed when pinned at the gate).
   */
  isSpawnPointClear(side: Side, spriteWidth: number): boolean {
    const half = spriteWidth / 2;
    let own = 0;
    for (const other of this.units.activeUnits) {
      if (!other.onLane) continue;
      const gap = Math.abs(other.x - SPAWN_X[side]) - half - other.halfWidth;
      if (gap >= UNIT_SPACING_PX) continue;
      if (other.side !== side) return false;
      own++;
    }
    return own < SPAWN_STACK_MAX;
  }

  /**
   * Ranged units keep shooting while they walk up behind the friendly unit in
   * front of them (owner, 2026-09-26), so the army stays a tight row with no
   * gaps. With no friendly unit ahead they hold their ground at range.
   */
  private closeRanks(unit: Unit, deltaMs: number): void {
    if (!unit.attack?.projectileKey || !unit.isAlive) return;
    const dir = laneDir(unit.side);
    let friendAhead = false;
    for (const other of this.units.activeUnits) {
      if (other === unit || other.side !== unit.side || !other.isAlive) continue;
      if ((other.x - unit.x) * dir > 0) {
        friendAhead = true;
        break;
      }
    }
    if (!friendAhead) return;
    const advance = Math.min((unit.getStat('speed') * deltaMs) / 1000, this.roomAhead(unit));
    if (advance > 0.01) unit.x += dir * advance;
  }

  /** How far the unit may move forward before touching a unit or the enemy base. */
  private roomAhead(unit: Unit): number {
    const dir = laneDir(unit.side);
    let room = Infinity;

    for (const other of this.units.activeUnits) {
      if (other === unit || !other.onLane || other.airborne) continue;
      let ahead = (other.x - unit.x) * dir;
      // Stacked at the same spot (spawn stacking): the older unit counts as
      // in front, so the stack peels off one by one instead of moving as one.
      if (ahead === 0 && other.side === unit.side && other.instanceId < unit.instanceId) ahead = 0.001;
      if (ahead <= 0) continue;
      room = Math.min(room, ahead - unit.halfWidth - other.halfWidth - UNIT_SPACING_PX);
    }

    const enemyBase = this.bases[otherSide(unit.side)];
    const toBase = (enemyBase.frontX - unit.x) * dir;
    room = Math.min(room, toBase - unit.halfWidth - UNIT_SPACING_PX);

    return Math.max(0, room);
  }
}
