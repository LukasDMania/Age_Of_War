import { getAge } from '@config/ages.config';
import { UNIT_QUEUE_LIMIT } from '@config/constants';
import type { UnitFactory } from '@entities/UnitFactory';
import { findUnitDefinition } from '@entities/unitDefinitions';
import { trySpendGold } from '@state/economyOps';
import type { MatchState } from '@state/GameState';
import { SIDES, type Side } from '@state/types';
import { emit, Events, on, type EventPayloads } from '@utils/EventBus';

/** Whether a unit could appear at its side's spawn point right now. */
export type SpawnPointCheck = (unitId: string, side: Side) => boolean;

/** Why a purchase was turned down. */
export type BuyRejection =
  | 'not-playing'
  | 'unknown-unit'
  | 'wrong-age'
  | 'queue-full'
  | 'cannot-afford';

/**
 * Buying and training units. A purchase is paid for up front and joins the
 * side's training queue (`SideState.trainingQueue`, at most
 * `UNIT_QUEUE_LIMIT` long). The unit at the front trains for its
 * `trainTimeMs`, then appears at the spawn point as soon as that is clear;
 * the rest wait their turn. Units are built through `UnitFactory`.
 *
 * The spawn point check is passed in as a function so this system does not
 * hold a reference to `LaneSystem`.
 *
 * Listens for: `buy-unit-requested`.
 * Emits: `unit-spawned`, `unit-queue-changed` (on buy, on spawn, and every
 * frame while the front unit is training so the HUD can show progress), and
 * `gold-changed` through economyOps.
 */
export class SpawnSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly isSpawnPointClear: SpawnPointCheck;
  private readonly unsubscribe: () => void;

  constructor(state: MatchState, units: UnitFactory, isSpawnPointClear: SpawnPointCheck) {
    this.state = state;
    this.units = units;
    this.isSpawnPointClear = isSpawnPointClear;
    this.unsubscribe = on(Events.BuyUnitRequested, (payload) => this.onBuyRequested(payload));
  }

  /** `deltaMs` is simulation time; call only while the match is playing. */
  update(deltaMs: number): void {
    for (const side of SIDES) this.train(side, deltaMs);
  }

  /**
   * Why `side` could not buy `unitId` right now, or null if it could. The
   * same rules apply to the player and the AI.
   */
  rejectionFor(side: Side, unitId: string): BuyRejection | null {
    if (this.state.phase !== 'playing') return 'not-playing';
    const definition = findUnitDefinition(unitId);
    if (!definition) return 'unknown-unit';
    const sideState = this.state[side];
    if (!getAge(sideState.age).unitIds.includes(unitId)) return 'wrong-age';
    if (sideState.trainingQueue.length >= UNIT_QUEUE_LIMIT) return 'queue-full';
    if (sideState.gold < definition.cost) return 'cannot-afford';
    return null;
  }

  /**
   * Puts a unit on the lane immediately, skipping gold and the queue. For the
   * temporary test spawner and dev cheats. Returns false if the spawn point
   * is occupied.
   */
  spawnNow(unitId: string, side: Side): boolean {
    if (!this.isSpawnPointClear(unitId, side)) return false;
    const unit = this.units.create(unitId, side);
    emit(Events.UnitSpawned, { side, unitId, instanceId: unit.instanceId });
    return true;
  }

  destroy(): void {
    this.unsubscribe();
  }

  private onBuyRequested({ side, unitId }: EventPayloads[typeof Events.BuyUnitRequested]): void {
    if (this.rejectionFor(side, unitId) !== null) return;
    const definition = findUnitDefinition(unitId);
    if (!definition || !trySpendGold(this.state, side, definition.cost, 'purchase')) return;
    this.state[side].trainingQueue.push({ unitId, remainingMs: definition.trainTimeMs });
    this.emitQueue(side);
  }

  private train(side: Side, deltaMs: number): void {
    const queue = this.state[side].trainingQueue;
    const front = queue[0];
    if (!front) return;

    const wasTraining = front.remainingMs > 0;
    if (wasTraining) front.remainingMs = Math.max(0, front.remainingMs - deltaMs);

    // Trained: appear as soon as the spawn point is clear, else keep waiting.
    if (front.remainingMs === 0 && this.spawnNow(front.unitId, side)) {
      queue.shift();
      this.emitQueue(side);
    } else if (wasTraining) {
      this.emitQueue(side);
    }
  }

  /** Sends a copy, so listeners can never edit the real queue. */
  private emitQueue(side: Side): void {
    const queue = this.state[side].trainingQueue.map((entry) => ({ ...entry }));
    emit(Events.UnitQueueChanged, { side, queue });
  }
}
