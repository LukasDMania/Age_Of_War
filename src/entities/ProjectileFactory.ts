import Phaser from 'phaser';
import { getProjectileFlight } from '@config/projectiles.config';
import { Projectile } from '@entities/Projectile';
import type { Side } from '@state/types';
import { ObjectPool } from '@utils/ObjectPool';

const PREWARM_PROJECTILES = 48;

/**
 * The only place projectiles come from. Anything that shoots (ranged units,
 * turrets, the special) asks for `launch(...)` and aims the result;
 * `ProjectileSystem` flies them and hands them back with `release`.
 */
export class ProjectileFactory {
  private readonly pool: ObjectPool<Projectile>;

  constructor(scene: Phaser.Scene) {
    this.pool = new ObjectPool<Projectile>({
      create: () => new Projectile(scene),
      onRelease: (projectile) => projectile.deactivate(),
      onDestroy: (projectile) => projectile.destroy(),
      prewarm: PREWARM_PROJECTILES,
    });
  }

  /** Projectiles in flight. A live view: do not mutate. */
  get activeProjectiles(): ReadonlySet<Projectile> {
    return this.pool.activeItems;
  }

  /** Total pooled objects ever created (for checking that shots are recycled). */
  get createdCount(): number {
    return this.pool.activeCount + this.pool.freeCount;
  }

  launch(
    projectileKey: string,
    side: Side,
    x: number,
    y: number,
    damage: number,
    splashRadius = 0,
  ): Projectile {
    return this.pool
      .acquire()
      .launch(projectileKey, side, x, y, damage, splashRadius, getProjectileFlight(projectileKey));
  }

  release(projectile: Projectile): void {
    this.pool.release(projectile);
  }

  destroy(): void {
    this.pool.destroy();
  }
}
