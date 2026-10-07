import { WAR_CRY } from '@config/experiments.config';
import type { UnitFactory } from '@entities/UnitFactory';
import type { MatchState } from '@state/GameState';
import { laneDir, SIDES, type Side } from '@state/types';
import { applyModifier } from '@systems/statusOps';
import { emit, Events, on } from '@utils/EventBus';

/**
 * War Cry (prototype, feature `warCry`, 2026-09-26): a second, small
 * cooldown ability next to the special. Every unit a side has on the lane
 * walks faster and hits harder for a few seconds (`WAR_CRY`), as timed
 * modifiers through `statusOps` (StatusSystem expires them). No gold cost.
 *
 * Listens for: `war-cry-requested`.
 * Emits: `war-cry-used`, `war-cry-cooldown-changed` (while it recharges,
 * in 100 ms steps); `modifier-applied` through statusOps.
 */
export class WarCrySystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly clock: () => number;
  private readonly readyAt: Record<Side, number> = { player: WAR_CRY.firstReadyMs, enemy: WAR_CRY.firstReadyMs };
  private readonly lastShown: Record<Side, number> = { player: -1, enemy: -1 };
  private readonly cleanups: (() => void)[];

  constructor(state: MatchState, units: UnitFactory, clock: () => number) {
    this.state = state;
    this.units = units;
    this.clock = clock;
    this.cleanups = [on(Events.WarCryRequested, ({ side }) => this.use(side))];
  }

  remainingMs(side: Side): number {
    return Math.max(0, this.readyAt[side] - this.clock());
  }

  /** `nowMs` is the simulation clock. */
  update(nowMs: number): void {
    for (const side of SIDES) {
      const remaining = Math.max(0, this.readyAt[side] - nowMs);
      const shown = Math.ceil(remaining / 100);
      if (shown !== this.lastShown[side]) {
        this.lastShown[side] = shown;
        emit(Events.WarCryCooldownChanged, { side, remainingMs: remaining, totalMs: WAR_CRY.cooldownMs });
      }
    }
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  private use(side: Side): void {
    const now = this.clock();
    if (this.state.phase !== 'playing' || now < this.readyAt[side]) return;
    const positions: number[] = [];
    const expiresAt = now + WAR_CRY.durationMs;
    for (const unit of this.units.activeUnits) {
      if (unit.side !== side || !unit.isAlive || unit.raider) continue;
      applyModifier(unit, { id: 'war-cry-speed', source: 'war-cry', stat: 'speed', mult: WAR_CRY.speedMult, expiresAt });
      applyModifier(unit, { id: 'war-cry-damage', source: 'war-cry', stat: 'damage', mult: WAR_CRY.damageMult, expiresAt });
      positions.push(unit.x);
    }
    if (positions.length === 0) return; // nobody to rally: keep it ready
    this.readyAt[side] = now + WAR_CRY.cooldownMs;
    emit(Events.WarCryUsed, { side, durationMs: WAR_CRY.durationMs, positions });
    emit(Events.WarCryCooldownChanged, { side, remainingMs: WAR_CRY.cooldownMs, totalMs: WAR_CRY.cooldownMs });
  }
}

/**
 * Uses the War Cry for an AI-played side (prototype): when it has at least
 * three fighters and an enemy is within 120 px of its front line. Acts only
 * through `war-cry-requested`.
 */
export class WarCryAi {
  private readonly side: Side;
  private readonly units: UnitFactory;
  private readonly system: WarCrySystem;
  private nextCheck = 0;

  constructor(side: Side, units: UnitFactory, system: WarCrySystem) {
    this.side = side;
    this.units = units;
    this.system = system;
  }

  update(nowMs: number): void {
    if (nowMs < this.nextCheck || this.system.remainingMs(this.side) > 0) return;
    this.nextCheck = nowMs + 500;
    const dir = laneDir(this.side);
    let fighters = 0;
    let front = -Infinity;
    for (const unit of this.units.activeUnits) {
      if (unit.side !== this.side || !unit.isAlive || !unit.attack) continue;
      fighters++;
      front = Math.max(front, unit.x * dir);
    }
    if (fighters < 3) return;
    for (const unit of this.units.activeUnits) {
      if (unit.side === this.side || !unit.isAlive) continue;
      if (Math.abs(unit.x * dir - front) <= 120) {
        emit(Events.WarCryRequested, { side: this.side });
        return;
      }
    }
  }
}
