import { researchMult } from '@config/buildings.config';
import { buildingEffects } from '@systems/BuildingSystem';
import {
  AGE_CATCH_UP,
  ECONOMY_KILL_BOUNTY_MULT,
  ECONOMY_PENALTY_FLOOR,
  KILL_GOLD_MULT,
  KILL_XP_MULT,
  MONEY_UNIT_REWORK,
} from '@config/constants';
import { feature } from '@config/features.config';
import type { UnitFactory } from '@entities/UnitFactory';
import { getUnitDefinition } from '@entities/unitDefinitions';
import { addGold, addXp } from '@state/economyOps';
import type { MatchState } from '@state/GameState';
import { SIDES, type Side } from '@state/types';
import { ageGap } from '@systems/ageCatchUp';
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
 * Money-unit rework (switch `moneyUnitRework`, 2026-09-27, see
 * `MONEY_UNIT_REWORK`): each money unit's income grows with the time it has
 * been alive, kills near a living friendly money unit pay extra ("loot"),
 * and killing one pays the enemy less. The HUD hears the growing income
 * through `economy-changed` about once a second.
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
  /** Gold per second from living money units, per side (before the ramp). */
  private readonly unitIncome: Record<Side, number> = { player: 0, enemy: 0 };
  /** Current gold per second with each unit's ramp (rework), per side. */
  private readonly rampedIncome: Record<Side, number> = { player: 0, enemy: 0 };
  /** Latest penalty per side, re-sent with the ramped income. */
  private readonly penalty: Record<Side, { count: number; damageMult: number; speedMult: number }> = {
    player: { count: 0, damageMult: 1, speedMult: 1 },
    enemy: { count: 0, damageMult: 1, speedMult: 1 },
  };
  /** Simulation clock (sum of update deltas) and when each money unit spawned. */
  private now = 0;
  private readonly bornAt = new Map<number, number>();
  private nextReportAt = 0;
  private readonly rework = feature('moneyUnitRework');
  private readonly cleanups: (() => void)[];

  constructor(state: MatchState, units: UnitFactory) {
    this.state = state;
    this.units = units;
    this.cleanups = [
      on(Events.UnitDied, (payload) => this.onUnitDied(payload)),
      on(Events.UnitSpawned, ({ side, unitId, instanceId }) => {
        if (!getUnitDefinition(unitId).income) return;
        this.bornAt.set(instanceId, this.now);
        this.recompute(side);
      }),
    ];
  }

  /** Gold per second a side earns from its living money units right now. */
  incomePerSec(side: Side): number {
    return this.rework ? this.rampedIncome[side] : this.unitIncome[side];
  }

  /** `deltaMs` is simulation time; call only while the match is playing. */
  update(deltaMs: number): void {
    this.now += deltaMs;
    if (this.rework) this.updateRamps();
    for (const side of SIDES) {
      // Market perk (Caravans) raises money-unit income.
      const income = this.incomePerSec(side) * buildingEffects(this.state[side]).moneyIncome;
      if (income > 0) this.pay(side, this.unitCarry, income, deltaMs, 'economy-unit');
    }
    if (this.rework && this.now >= this.nextReportAt) {
      this.nextReportAt = this.now + 1000;
      for (const side of SIDES) if (this.penalty[side].count > 0) this.report(side);
    }
  }

  /** Income multiplier of a money unit alive for `aliveMs` (rework). */
  static rampMult(aliveMs: number): number {
    const r = MONEY_UNIT_REWORK.ramp;
    return r.startMult + (r.maxMult - r.startMult) * Math.min(1, Math.max(0, aliveMs) / r.fullAtMs);
  }

  /** Sums each side's ramped income and shows each money unit's progress on its bar. */
  private updateRamps(): void {
    this.rampedIncome.player = 0;
    this.rampedIncome.enemy = 0;
    const r = MONEY_UNIT_REWORK.ramp;
    for (const unit of this.units.activeUnits) {
      const income = unit.definition.income;
      if (!income || !unit.isAlive) continue;
      const alive = this.now - (this.bornAt.get(unit.instanceId) ?? this.now);
      this.rampedIncome[unit.side] += income.goldPerSecond * EconomySystem.rampMult(alive);
      unit.setIncomeRamp(Math.min(1, alive / r.fullAtMs));
    }
  }

  /** Extra kill gold from friendly money units near where the victim fell (rework). */
  private lootBonus(killerSide: Side, x: number): number {
    const loot = MONEY_UNIT_REWORK.loot;
    let count = 0;
    for (const unit of this.units.activeUnits) {
      if (unit.side === killerSide && unit.isAlive && unit.definition.income && Math.abs(unit.x - x) <= loot.radius) count++;
    }
    return Math.min(loot.maxBonus, count * loot.bonusPerUnit);
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

  private onUnitDied({ side, unitId, killerSide, instanceId, x }: EventPayloads[typeof Events.UnitDied]): void {
    const definition = getUnitDefinition(unitId);
    const bounty = definition.income ? (this.rework ? MONEY_UNIT_REWORK.bountyMult : ECONOMY_KILL_BOUNTY_MULT) : 1;
    const plunder = researchMult('bounty', this.state[killerSide].research.bounty);
    const perks = buildingEffects(this.state[killerSide]).killGold;
    const loot = this.rework ? 1 + this.lootBonus(killerSide, x) : 1;
    this.bornAt.delete(instanceId);
    addGold(this.state, killerSide, definition.killGold * bounty * plunder * perks * loot * KILL_GOLD_MULT, 'kill');
    // Catch-up: a side behind in age learns faster from its kills.
    const catchUp = 1 + AGE_CATCH_UP.killXpPerAge * ageGap(this.state, killerSide);
    addXp(this.state, killerSide, definition.killXp * KILL_XP_MULT * catchUp);
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
    this.penalty[side] = { count, damageMult, speedMult };
    if (this.rework) this.updateRamps();

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
    this.report(side);
  }

  private report(side: Side): void {
    const { count, damageMult, speedMult } = this.penalty[side];
    emit(Events.EconomyChanged, { side, economyUnits: count, incomePerSec: this.incomePerSec(side), damageMult, speedMult });
  }
}
