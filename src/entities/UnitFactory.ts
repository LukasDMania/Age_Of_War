import Phaser from 'phaser';
import { SPAWN_X } from '@config/constants';
import { Unit } from '@entities/Unit';
import { getUnitDefinition } from '@entities/unitDefinitions';
import type { Side } from '@state/types';
import { ObjectPool } from '@utils/ObjectPool';
import { textureKeyFor } from '@utils/PlaceholderArt';

const PREWARM_UNITS = 24;

/**
 * Builds units from their definitions. The only place units are created:
 * systems ask for `create(unitId, side)` and hand units back with `release`.
 * Owns the pool and the running list of units currently on the lane.
 */
export class UnitFactory {
  private readonly pool: ObjectPool<Unit>;
  private readonly scene: Phaser.Scene;
  private nextInstanceId = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.pool = new ObjectPool<Unit>({
      create: () => new Unit(scene),
      onRelease: (unit) => unit.deactivate(),
      onDestroy: (unit) => unit.destroy(),
      prewarm: PREWARM_UNITS,
    });
  }

  /** Units currently on the lane. A live view: do not mutate. */
  get activeUnits(): ReadonlySet<Unit> {
    return this.pool.activeItems;
  }

  /** The unit on the lane with this instance id, if any. */
  findByInstanceId(instanceId: number): Unit | undefined {
    for (const unit of this.pool.activeItems) {
      if (unit.instanceId === instanceId) return unit;
    }
    return undefined;
  }

  /** Width of a unit's sprite, for checking the spawn point is clear. */
  spriteWidth(unitId: string, side: Side): number {
    const def = getUnitDefinition(unitId);
    return this.scene.textures.getFrame(textureKeyFor(def.spriteKey, side)).width;
  }

  /** Spawns a unit at its side's spawn point. */
  create(unitId: string, side: Side): Unit {
    const definition = getUnitDefinition(unitId);
    const unit = this.pool.acquire();
    unit.init(definition, side, this.nextInstanceId++, SPAWN_X[side]);
    return unit;
  }

  release(unit: Unit): void {
    this.pool.release(unit);
  }

  releaseAll(): void {
    this.pool.releaseAll();
  }

  destroy(): void {
    this.pool.destroy();
  }
}
