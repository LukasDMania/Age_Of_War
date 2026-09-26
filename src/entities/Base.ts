import Phaser from 'phaser';
import { baseMaxHp, LANE_Y, MAX_TURRET_SLOTS } from '@config/constants';
import { turretSlotPosition } from '@entities/Turret';
import type { SideState } from '@state/GameState';
import type { Side } from '@state/types';
import { baseSpriteKey, textureKeyFor } from '@utils/PlaceholderArt';

const LEDGE_WIDTH = 46;
const LEDGE_HEIGHT = 6;
const LEDGE_COLOR = 0x3a3027;
const HIT_FLASH_MS = 70;

/**
 * A side's base sprite. Hit points live on the side's `SideState.baseHp`;
 * this class only keeps them in range and greys the sprite out at zero. The
 * rules for who damages it, and what happens at zero, live in the systems.
 * The HP bar is drawn by the HUD (Phase 3), from `base-damaged` events.
 * Unlocked turret slots are drawn as small ledges up the front edge.
 */
export class Base extends Phaser.GameObjects.Image {
  readonly side: Side;

  private readonly sideState: SideState;
  private readonly ledges: Phaser.GameObjects.Graphics;
  private flashUntil = 0;

  constructor(scene: Phaser.Scene, side: Side, sideState: SideState, x: number) {
    super(scene, x, LANE_Y, textureKeyFor(baseSpriteKey(sideState.age), side));
    this.side = side;
    this.sideState = sideState;
    this.setOrigin(0.5, 1);
    this.setFlipX(side === 'enemy');
    scene.add.existing(this);
    this.ledges = scene.add.graphics().setDepth(1.5);
    this.showSlots(sideState.unlockedSlots);
  }

  /** Switches to the look of the given age (Phase 8). Size stays the same. */
  setAge(age: number): void {
    this.setTexture(textureKeyFor(baseSpriteKey(age), this.side));
  }

  /** Draws a ledge for each unlocked turret slot. */
  showSlots(unlocked: number): void {
    this.ledges.clear();
    this.ledges.fillStyle(LEDGE_COLOR, 1);
    for (let i = 0; i < Math.min(unlocked, MAX_TURRET_SLOTS); i++) {
      const { x, y } = turretSlotPosition(this.side, i);
      this.ledges.fillRect(x - LEDGE_WIDTH / 2, y, LEDGE_WIDTH, LEDGE_HEIGHT);
    }
  }

  /** Max HP grows with the side's age (`BASE_HP_BY_AGE`). */
  get maxHp(): number {
    return baseMaxHp(this.sideState.age);
  }

  get hp(): number {
    return this.sideState.baseHp;
  }

  get isDestroyed(): boolean {
    return this.sideState.baseHp <= 0;
  }

  get halfWidth(): number {
    return this.displayWidth / 2;
  }

  /** X of the edge that faces the middle of the lane. */
  get frontX(): number {
    return this.side === 'player' ? this.x + this.halfWidth : this.x - this.halfWidth;
  }

  /** Bookkeeping only: lowers HP (never below 0) and returns the new value. */
  takeDamage(amount: number): number {
    this.sideState.baseHp = Math.max(0, this.sideState.baseHp - amount);
    if (this.isDestroyed) {
      this.flashUntil = 0;
      this.setTint(0x444444);
    } else if (amount > 0) {
      this.flashUntil = this.scene.time.now + HIT_FLASH_MS;
      this.setTint(0xffd0c8);
    }
    return this.sideState.baseHp;
  }

  /** Called by the scene update list (added in `scene.add.existing`). */
  preUpdate(time: number): void {
    if (this.flashUntil !== 0 && time >= this.flashUntil) {
      this.flashUntil = 0;
      this.clearTint();
    }
  }

  override destroy(fromScene?: boolean): void {
    this.ledges.destroy(fromScene);
    super.destroy(fromScene);
  }
}
