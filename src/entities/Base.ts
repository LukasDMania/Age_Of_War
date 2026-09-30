import Phaser from 'phaser';
import { baseMaxHp, LANE_Y, MAX_TURRET_SLOTS } from '@config/constants';
import { turretSlotPosition } from '@entities/Turret';
import type { SideState } from '@state/GameState';
import type { Side } from '@state/types';
import {
  BASE_SUPERSAMPLE,
  baseArtKey,
  baseDamageKey,
  ensureBaseArt,
  LEDGE_ORIGIN,
  ledgeArtKey,
} from '@utils/BaseArt';

const HIT_FLASH_MS = 70;
/** Turret post color per age: wood, stone, timber, steel, white alloy. */
const POST_COLORS: readonly number[] = [0x5c3719, 0x8a877f, 0x5c3719, 0x5d636b, 0xc3ccd6];
/** HP shares below which the base shows cracks, then heavy damage. */
const DAMAGE_STAGES = [0.66, 0.33] as const;

/**
 * A side's base sprite. Hit points live on the side's `SideState.baseHp`;
 * this class only keeps them in range and greys the sprite out at zero. The
 * rules for who damages it, and what happens at zero, live in the systems.
 * The HP bar is drawn by the HUD (Phase 3), from `base-damaged` events.
 * Unlocked turret slots are drawn as ledges up the front edge. Art per age
 * (rig style, 2026-09-26) with cracks as it loses HP.
 */
export class Base extends Phaser.GameObjects.Image {
  readonly side: Side;

  private readonly sideState: SideState;
  private readonly ledges: Phaser.GameObjects.Image[] = [];
  /** The post holding the ledges up (drawn behind them). */
  private readonly post: Phaser.GameObjects.Graphics;
  private readonly cracks: Phaser.GameObjects.Image;
  private flashUntil = 0;
  private unlocked = 0;

  constructor(scene: Phaser.Scene, side: Side, sideState: SideState, x: number) {
    ensureBaseArt(scene, sideState.age, side);
    super(scene, x, LANE_Y, baseArtKey(sideState.age, side));
    this.side = side;
    this.sideState = sideState;
    this.setOrigin(0.5, 1).setScale(1 / BASE_SUPERSAMPLE);
    this.setFlipX(side === 'enemy');
    scene.add.existing(this);
    this.cracks = scene.add
      .image(x, LANE_Y, baseDamageKey(1))
      .setOrigin(0.5, 1)
      .setScale(1 / BASE_SUPERSAMPLE)
      .setFlipX(side === 'enemy')
      .setVisible(false);
    this.post = scene.add.graphics().setDepth(1.4);
    this.showSlots(sideState.unlockedSlots);
  }

  /** Switches to the look of the given age (Phase 8). Size stays the same. */
  setAge(age: number): void {
    ensureBaseArt(this.scene, age, this.side);
    this.setTexture(baseArtKey(age, this.side));
    this.showSlots(this.unlocked);
    this.showDamage();
  }

  /** Draws a ledge for each unlocked turret slot, in the age's style. */
  showSlots(unlocked: number): void {
    this.unlocked = unlocked;
    for (const ledge of this.ledges) ledge.destroy();
    this.ledges.length = 0;
    const key = ledgeArtKey(this.sideState.age, this.side);
    this.post.clear();
    const count = Math.min(unlocked, MAX_TURRET_SLOTS);
    if (count > 1) {
      // A post from the ground up to the highest ledge, in the age's material.
      const top = turretSlotPosition(this.side, count - 1);
      const color = POST_COLORS[Math.min(this.sideState.age, POST_COLORS.length - 1)] ?? 0x5c3719;
      this.post.fillStyle(0x1a120c, 1).fillRect(top.x - 4.5, top.y, 9, LANE_Y - top.y);
      this.post.fillStyle(color, 1).fillRect(top.x - 3, top.y, 6, LANE_Y - top.y);
    }
    for (let i = 0; i < count; i++) {
      const { x, y } = turretSlotPosition(this.side, i);
      this.ledges.push(
        this.scene.add
          .image(x, y, key)
          .setOrigin(LEDGE_ORIGIN.x, LEDGE_ORIGIN.y)
          .setScale(1 / BASE_SUPERSAMPLE)
          .setFlipX(this.side === 'enemy')
          .setDepth(1.5),
      );
    }
  }

  /** Cracks once the base is below 66% HP, heavier below 33%. */
  private showDamage(): void {
    const share = this.hp / this.maxHp;
    const stage = share < DAMAGE_STAGES[1] ? 2 : share < DAMAGE_STAGES[0] ? 1 : 0;
    this.cracks.setVisible(stage > 0 && !this.isDestroyed);
    if (stage > 0) this.cracks.setTexture(baseDamageKey(stage as 1 | 2));
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
    this.showDamage();
    if (this.isDestroyed) {
      this.flashUntil = 0;
      this.setTint(0x444444);
    } else if (amount > 0) {
      this.flashUntil = this.scene.time.now + HIT_FLASH_MS;
      this.setTint(0xffd0c8);
    }
    return this.sideState.baseHp;
  }

  /** Bookkeeping only: raises HP (never above max) and returns the new value. */
  repair(amount: number): number {
    if (this.isDestroyed || !(amount > 0)) return this.sideState.baseHp;
    this.sideState.baseHp = Math.min(this.maxHp, this.sideState.baseHp + amount);
    this.showDamage();
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
    for (const ledge of this.ledges) ledge.destroy(fromScene);
    this.cracks.destroy(fromScene);
    this.post.destroy(fromScene);
    super.destroy(fromScene);
  }
}
