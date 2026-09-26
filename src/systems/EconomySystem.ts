import { researchMult } from '@config/buildings.config';
import { ECONOMY_KILL_BOUNTY_MULT, ECONOMY_PENALTY_FLOOR, KILL_GOLD_MULT, KILL_XP_MULT } from '@config/constants';
import type { UnitFactory } from '@entities/UnitFactory';
import { getUnitDefinition } from '@entities/unitDefinitions';
import { addGold, addXp } from '@state/economyOps';
import type { MatchState } from '@state/GameState';
import { SIDES, type Side } from '@state/types';
import { clearSideModifier, setSideModifier } from '@systems/statusOps';
import { emit, Events, on, type EventPayloads } from '@utils/EventBus';

/** Ids of the side-wide modifiers the money units put on their side. */
const PENALTY_DAMAGE_ID = 'economy-penalty-damage';
const PENALTY_SPEED_ID = 'economy-penalty-speed';

/**
 * Income, and the money units' trade-off.
 *
 * - Kills: the dead unit's `killGold` (x `ECONOMY_KILL_BOUNTY_MULT` for a
 *   money unit, x the killer's Plunder research) and `killXp` go to the side
 *   that scored the kill.
 * - Passive income was removed in Phase 14: the Mine (`BuildingSystem`)
 *   replaces it.
 * - Money units (Phase 9): every living unit with an `income` block earns its
 *   `goldPerSecond` for its side. While any are alive, the side's other units
 *   (not the money units themselves) get a damage and a speed penalty: the
 *   product of each money unit's `allyPenalty`, never below
 *   `ECONOMY_PENALTY_FLOOR`. It is recomputed the moment a money unit spawns
 *   or dies, and applied through `statusOps` side-wide modifiers, so units
 *   spawned later get it too.
 *
 * Income is paid in whole-gold steps (fractions carry over), through
 * `state/economyOps.ts`.
 *
 * Listens for: `unit-died`, `unit-spawned`.
 * Emits: `economy-changed`; `gold-changed` and `xp-changed` through
 * economyOps; `modifier-applied` / `modifier-removed` through statusOps.
 */
export class EconomySystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  /** Fractional gold not paid out yet, per side and source. */
  private readonly unitCarry: Record<Side, number> = { player: 0, enemy: 0 };
  /** Gold per second from living money units, per side. */
  private readonly unitIncome: Record<Side, number> = { player: 0, enemy: 0 };
  private readonly cleanups: (() => void)[];

  constructor(state: MatchState, units: UnitFactory) {
    this.state = state;
    this.units = units;
    this.cleanups = [
      on(Events.UnitDied, (payload) => this.onUnitDied(payload)),
      on(Events.UnitSpawned, ({ side, unitId }) => {
        if (getUnitDefinition(unitId).income) this.recompute(side);
      }),
    ];
  }

  /** Gold per second a side earns from its living money units. */
  incomePerSec(side: Side): number {
    return this.unitIncome[side];
  }

  /** `deltaMs` is simulation time; call only while the match is playing. */
  update(deltaMs: number): void {
    for (const side of SIDES) {
      if (this.unitIncome[side] > 0) this.pay(side, this.unitCarry, this.unitIncome[side], deltaMs, 'economy-unit');
    }
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  private pay(
    side: Side,
    carry: Record<Side, number>,
    perSec: number,
    deltaMs: number,
    source: 'economy-unit',
  ): void {
    carry[side] += (perSec * deltaMs) / 1000;
    const whole = Math.floor(carry[side]);
    if (whole <= 0) return;
    carry[side] -= whole;
    addGold(this.state, side, whole, source);
  }

  private onUnitDied({ side, unitId, killerSide }: EventPayloads[typeof Events.UnitDied]): void {
    const definition = getUnitDefinition(unitId);
    const bounty = definition.income ? ECONOMY_KILL_BOUNTY_MULT : 1;
    const plunder = researchMult('bounty', this.state[killerSide].research.bounty);
    addGold(this.state, killerSide, definition.killGold * bounty * plunder * KILL_GOLD_MULT, 'kill');
    addXp(this.state, killerSide, definition.killXp * KILL_XP_MULT);
    if (definition.income) this.recompute(side);
  }

  /**
   * Counts a side's living money units and sets its income and penalty. The
   * dying unit is already marked dead when `unit-died` arrives, so it is not
   * counted.
   */
  private recompute(side: Side): void {
    let count = 0;
    let income = 0;
    let damageMult = 1;
    let speedMult = 1;
    for (const unit of this.units.activeUnits) {
      if (unit.side !== side || !unit.isAlive || !unit.definition.income) continue;
      count++;
      income += unit.definition.income.goldPerSecond;
      damageMult *= unit.definition.allyPenalty?.damageMult ?? 1;
      speedMult *= unit.definition.allyPenalty?.speedMult ?? 1;
    }
    damageMult = Math.max(ECONOMY_PENALTY_FLOOR, damageMult);
    speedMult = Math.max(ECONOMY_PENALTY_FLOOR, speedMult);
    this.unitIncome[side] = income;
    if (count === 0) this.unitCarry[side] = 0;

    const units = this.units.activeUnits;
    if (damageMult < 1) {
      setSideModifier(this.state, units, side, {
        id: PENALTY_DAMAGE_ID,
        source: 'economy',
        stat: 'damage',
        mult: damageMult,
        exemptRoles: ['economy'],
      });
    } else {
      clearSideModifier(this.state, units, side, PENALTY_DAMAGE_ID);
    }
    if (speedMult < 1) {
      setSideModifier(this.state, units, side, {
        id: PENALTY_SPEED_ID,
        source: 'economy',
        stat: 'speed',
        mult: speedMult,
        exemptRoles: ['economy'],
      });
    } else {
      clearSideModifier(this.state, units, side, PENALTY_SPEED_ID);
    }
    emit(Events.EconomyChanged, { side, economyUnits: count, incomePerSec: income, damageMult, speedMult });
  }
}
