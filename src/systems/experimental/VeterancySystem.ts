import { VETERANCY } from '@config/experiments.config';
import type { Unit } from '@entities/Unit';
import type { UnitFactory } from '@entities/UnitFactory';
import type { Side } from '@state/types';
import { applyModifier } from '@systems/statusOps';
import { emit, Events, on } from '@utils/EventBus';

/**
 * Veterancy (prototype, feature `veterancy`, 2026-09-26): units that score
 * kills rank up. A kill is credited to the killer side's living combat unit
 * nearest to where the victim fell (the rules don't track who fired a shot,
 * and in a single lane the nearest fighter almost always made the kill).
 * Ranks (`VETERANCY.ranks`) raise max HP and damage through `statusOps`
 * (current HP is kept: no heal, owner 2026-09-27); the unit shows chevrons
 * over its HP bar.
 *
 * Listens for: `unit-died`. Emits: `unit-promoted`; `modifier-applied`
 * through statusOps.
 */
export class VeterancySystem {
  private readonly units: UnitFactory;
  private readonly cleanups: (() => void)[];

  constructor(units: UnitFactory) {
    this.units = units;
    this.cleanups = [on(Events.UnitDied, ({ x, killerSide, retired }) => {
        if (!retired) this.credit(killerSide, x);
      })];
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  private credit(killerSide: Side, x: number): void {
    let best: Unit | null = null;
    let bestGap: number = VETERANCY.creditRadius;
    for (const unit of this.units.activeUnits) {
      if (unit.side !== killerSide || !unit.isAlive || !unit.attack || unit.raider) continue;
      const gap = Math.max(0, Math.abs(unit.x - x) - unit.halfWidth);
      if (gap <= bestGap) {
        best = unit;
        bestGap = gap;
      }
    }
    if (!best) return;
    best.kills++;
    const rank = VETERANCY.ranks.filter((r) => best.kills >= r.kills).length;
    if (rank <= best.rank) return;
    const spec = VETERANCY.ranks[rank - 1]!;
    best.rank = rank;
    // Owner, 2026-09-27: a promotion raises max HP but never heals.
    applyModifier(best, { id: 'veteran-hp', source: 'veterancy', stat: 'maxHp', mult: spec.hp }, 'keep');
    applyModifier(best, { id: 'veteran-damage', source: 'veterancy', stat: 'damage', mult: spec.damage });
    emit(Events.UnitPromoted, { side: best.side, instanceId: best.instanceId, rank, x: best.x, topY: best.topY });
  }
}
