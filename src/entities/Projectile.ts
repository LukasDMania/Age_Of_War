import Phaser from 'phaser';
import type { ProjectileFlight } from '@config/projectiles.config';
import type { Base } from '@entities/Base';
import type { Unit } from '@entities/Unit';
import type { Side } from '@state/types';
import { FX_SUPERSAMPLE } from '@utils/FxArt';

/**
 * A pooled projectile: a sprite plus the state of one shot. Built and
 * recycled by `ProjectileFactory`; moved and resolved by `ProjectileSystem`.
 * All fields are plain values so firing a shot allocates nothing.
 *
 * It flies in a straight line (`dirX`, `dirY`) and hits the first enemy
 * unit on that line, the enemy base if `hitsBase` is set, or the ground.
 * The `impact*` fields are filled in by `ProjectileSystem` when it hits.
 */
export class Projectile extends Phaser.GameObjects.Image {
  side: Side = 'player';
  damage = 0;
  splashRadius = 0;
  dirX = 1;
  dirY = 0;
  /** Whether the enemy base stops (and takes damage from) this shot. */
  hitsBase = false;
  ageMs = 0;
  flight!: ProjectileFlight;

  impactX = 0;
  /** The texture / projectile key, for effects (trails, impacts). */
  key = '';
  impactUnit: Unit | null = null;
  impactBase: Base | null = null;
  /** Who fired it, for side traits: the unit's slot (0: not a unit), the turret's slot and kind. */
  sourceSlot: 0 | 1 | 2 | 3 | 4 | 5 = 0;
  turretSlot = -1;
  turretKind: 'rapid' | 'heavy' | 'area' | null = null;
  /** Enemies it may still fly through (Conquest's pierce trait), and the one it just went through. */
  pierceLeft = 0;
  ignoreUnit: Unit | null = null;
  /** Aimed over the front line (a Mech's Sniper scope): hits only this unit, else the ground. */
  onlyUnit: Unit | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, '__DEFAULT');
    this.setDepth(3);
    scene.add.existing(this);
    this.deactivate();
  }

  /** Readies a pooled projectile at (x, y). Point it with `aimAt` next. */
  launch(
    textureKey: string,
    side: Side,
    x: number,
    y: number,
    damage: number,
    splashRadius: number,
    flight: ProjectileFlight,
  ): this {
    this.setTexture(textureKey).setScale(1 / FX_SUPERSAMPLE);
    this.side = side;
    this.damage = damage;
    this.splashRadius = splashRadius;
    this.flight = flight;
    this.key = textureKey;
    this.ageMs = 0;
    this.hitsBase = false;
    this.impactUnit = null;
    this.impactBase = null;
    this.sourceSlot = 0;
    this.turretSlot = -1;
    this.turretKind = null;
    this.pierceLeft = 0;
    this.ignoreUnit = null;
    this.onlyUnit = null;
    this.setPosition(x, y).setRotation(0).setFlipX(false);
    this.setActive(true).setVisible(true);
    return this;
  }

  /**
   * Sends it in a straight line through (x, y) and beyond. `hitsBase` lets
   * the enemy base stop it (units' shots); otherwise it flies past bases.
   */
  aimAt(x: number, y: number, hitsBase = false): void {
    const dx = x - this.x;
    const dy = y - this.y;
    const length = Math.hypot(dx, dy) || 1;
    this.dirX = dx / length;
    this.dirY = dy / length;
    this.hitsBase = hitsBase;
    if (this.flight.rotate) this.setRotation(Math.atan2(dy, dx));
    // Non-rotating sprites are drawn facing right; mirror them for leftward shots.
    else this.setFlipX(this.dirX < 0);
  }

  deactivate(): void {
    this.onlyUnit = null;
    this.impactUnit = null;
    this.impactBase = null;
    this.ignoreUnit = null;
    this.onlyUnit = null;
    this.setActive(false).setVisible(false);
  }
}
