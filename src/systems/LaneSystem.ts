import {
  SPAWN_X,
  SUPPORT_RALLY_OFFSET,
  SUPPORT_STAGGER,
  SUPPORT_TRAIL_GAP,
  UNIT_SPACING_PX,
} from '@config/constants';
import type { Base } from '@entities/Base';
import { UnitState, type Unit } from '@entities/Unit';
import type { UnitFactory } from '@entities/UnitFactory';
import { laneDir, otherSide, SIDES, type Side } from '@state/types';

type SupportKind = 'economy' | 'utility';

function supportKind(unit: Unit): SupportKind {
  return unit.definition.role === 'economy' ? 'economy' : 'utility';
}

/**
 * Movement along the lane, including blocking. Units that are not fighting
 * walk toward the enemy base, but never through an enemy unit and never into
 * the enemy base, so they queue up behind whatever is in front of them.
 *
 * Friendly combat units block each other. Support units (money and utility
 * units, `Unit.isSupport`, Phase 9) never block friendly units and are never
 * blocked by them: they don't lead the army but follow it, walking up to
 * `SUPPORT_TRAIL_GAP` behind the front-most friendly combat unit, lined up
 * `SUPPORT_STAGGER` apart in spawn order and keeping pace with it (they walk
 * at least as fast as it does), or wait at a rally point in front of their
 * base when their side has no combat unit on the lane. Enemies stop them like
 * anyone else. Nobody walks backwards.
 *
 * `CombatSystem` runs first each frame and marks units `Attacking` (which
 * stand still) or `Walking`; this system then moves the walkers, and marks
 * those that could not move as `Idle`.
 *
 * No events: movement is not something other systems need to hear about.
 */
export class LaneSystem {
  private readonly units: UnitFactory;
  private readonly bases: Record<Side, Base>;
  /** Per side, the front-most living combat unit this frame (null if none). */
  private readonly leaders: Record<Side, Unit | null> = { player: null, enemy: null };
  /** Support units per side and kind, in spawn order (rebuilt every frame). */
  private readonly supports: Record<Side, Record<SupportKind, Unit[]>> = {
    player: { economy: [], utility: [] },
    enemy: { economy: [], utility: [] },
  };

  constructor(units: UnitFactory, bases: Record<Side, Base>) {
    this.units = units;
    this.bases = bases;
  }

  update(deltaMs: number): void {
    this.survey();
    for (const unit of this.units.activeUnits) {
      if (unit.unitState !== UnitState.Walking && unit.unitState !== UnitState.Idle) {
        continue;
      }
      const dir = laneDir(unit.side);
      const wanted = (this.walkSpeed(unit) * deltaMs) / 1000;
      let room = this.roomAhead(unit);
      if (unit.isSupport) room = Math.min(room, this.supportRoom(unit));
      const advance = Math.min(wanted, room);
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
   * point without overlapping a unit that would block it (see `blocks`).
   */
  isSpawnPointClear(side: Side, spriteWidth: number, support: boolean): boolean {
    const half = spriteWidth / 2;
    for (const other of this.units.activeUnits) {
      if (other.side === side && (support || other.isSupport)) continue;
      const gap = Math.abs(other.x - SPAWN_X[side]) - half - other.halfWidth;
      if (gap < UNIT_SPACING_PX) return false;
    }
    return true;
  }

  /** Whether `other` stands in `unit`'s way: every enemy; friends only combat-to-combat. */
  private blocks(unit: Unit, other: Unit): boolean {
    return other.side !== unit.side || (!unit.isSupport && !other.isSupport);
  }

  /** How far a unit may move forward before touching whatever is ahead. */
  private roomAhead(unit: Unit): number {
    const dir = laneDir(unit.side);
    let room = Infinity;

    for (const other of this.units.activeUnits) {
      if (other === unit || !other.isAlive || !this.blocks(unit, other)) continue;
      const ahead = (other.x - unit.x) * dir;
      if (ahead <= 0) continue;
      room = Math.min(room, ahead - unit.halfWidth - other.halfWidth - UNIT_SPACING_PX);
    }

    const enemyBase = this.bases[otherSide(unit.side)];
    const toBase = (enemyBase.frontX - unit.x) * dir;
    room = Math.min(room, toBase - unit.halfWidth - UNIT_SPACING_PX);

    return Math.max(0, room);
  }

  /**
   * A unit's walking speed. Support units that follow a leader keep pace
   * with it (move at least as fast), so a slow healer doesn't fall out of
   * range while the army marches.
   */
  private walkSpeed(unit: Unit): number {
    const own = unit.getStat('speed');
    const leader = unit.isSupport ? this.leaders[unit.side] : null;
    return leader ? Math.max(own, leader.getStat('speed')) : own;
  }

  /** How far a support unit may go before it would pass its spot in the line. */
  private supportRoom(unit: Unit): number {
    const dir = laneDir(unit.side);
    const kind = supportKind(unit);
    const rank = Math.max(0, this.supports[unit.side][kind].indexOf(unit));
    const leader = this.leaders[unit.side];
    let spotX: number;
    if (leader) {
      const leaderBack = leader.x - dir * leader.halfWidth;
      spotX = leaderBack - dir * (SUPPORT_TRAIL_GAP[kind] + unit.halfWidth);
    } else {
      spotX = SPAWN_X[unit.side] + dir * SUPPORT_RALLY_OFFSET;
    }
    spotX -= dir * rank * SUPPORT_STAGGER;
    return Math.max(0, (spotX - unit.x) * dir);
  }

  /** Finds each side's front-most combat unit and orders its support units. */
  private survey(): void {
    for (const side of SIDES) {
      this.leaders[side] = null;
      this.supports[side].economy.length = 0;
      this.supports[side].utility.length = 0;
    }
    for (const unit of this.units.activeUnits) {
      if (!unit.isAlive) continue;
      if (unit.isSupport) {
        this.supports[unit.side][supportKind(unit)].push(unit);
        continue;
      }
      const current = this.leaders[unit.side];
      if (!current || (unit.x - current.x) * laneDir(unit.side) > 0) this.leaders[unit.side] = unit;
    }
    for (const side of SIDES) {
      this.supports[side].economy.sort((a, b) => a.instanceId - b.instanceId);
      this.supports[side].utility.sort((a, b) => a.instanceId - b.instanceId);
    }
  }
}
