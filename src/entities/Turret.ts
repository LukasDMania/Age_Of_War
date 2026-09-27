import Phaser from 'phaser';
import { BASE_X, TURRET_DAMAGE_MULT, TURRET_SLOT_LAYOUT } from '@config/constants';
import { TURRET_MOTION, type TurretArtId, type TurretMotion } from '@/art/turretDraw';
import { getTurretDefinition, type TurretDefinition } from '@entities/turretDefinitions';
import { researchMult } from '@config/buildings.config';
import type { SideState, TurretState } from '@state/GameState';
import { laneDir, type Side } from '@state/types';
import { flipOriginX } from '@utils/spriteOrigin';
import {
  ensureTurretArt,
  TURRET_FLASH_ORIGIN,
  TURRET_HEAD_ORIGIN,
  TURRET_MOUNT_ORIGIN,
  TURRET_SUPERSAMPLE,
  turretArtId,
  turretFlashKey,
  turretHeadKey,
  turretMountKey,
} from '@utils/TurretArt';

/** Turret stats that upgrades (Phase 11) can change. */
export type TurretStat = 'damage' | 'cooldown' | 'range';

/** Bottom-center of a turret slot on a side's base. */
export function turretSlotPosition(side: Side, slotIndex: number): { x: number; y: number } {
  return {
    x: BASE_X[side] + laneDir(side) * TURRET_SLOT_LAYOUT.offsetX,
    y: TURRET_SLOT_LAYOUT.firstY - slotIndex * TURRET_SLOT_LAYOUT.spacingY,
  };
}

/** How fast a head turns toward its target, radians per real second. */
const TURN_RATE = 7;
/** Recoil: kick back fast, ease forward. Real ms. */
const RECOIL_MS = 220;
/** Throwing arms: swing to the release angle, hold, return. Real ms. */
const SWING_MS = { out: 90, hold: 90, back: 520 };
const FLASH_MS = 70;

/**
 * A built turret: a mount sprite in one of its base's slots and a head that
 * turns toward the enemy it is shooting (visual only), plus the definition
 * and fire timer. Its persistent part (id, upgrade level, gold spent) is the
 * `TurretState` in `SideState.turrets`, which this object reads. Targeting
 * and firing rules live in `TurretSystem`, which tells it what it is aiming
 * at (`track`) and when it fires (`playFire`); art is from
 * `art/turretDraw.ts` and changes look with the upgrade level.
 */
export class Turret extends Phaser.GameObjects.Image {
  readonly side: Side;
  readonly slotIndex: number;
  readonly definition: TurretDefinition;
  readonly turretState: TurretState;
  /** The owner's state, for Forge research bonuses (Phase 14). */
  private readonly sideState: SideState;
  /** Sim time (ms) at which it may fire again. */
  fireReadyAt = 0;
  /** Small gold dots under the turret, one per upgrade level bought. */
  private readonly pips: Phaser.GameObjects.Graphics;
  private readonly head: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Image | null;
  private readonly artId: TurretArtId;
  private readonly motion: TurretMotion;
  private readonly dir: 1 | -1;
  /** Head angle now and the one it turns toward (radians, positive up). */
  private aim: number;
  private aimTarget: number;
  /** Scene time of the last shot, for recoil / swing / flash. */
  private firedAt = -Infinity;

  constructor(scene: Phaser.Scene, side: Side, slotIndex: number, turretState: TurretState, sideState: SideState) {
    const definition = getTurretDefinition(turretState.turretId);
    const { x, y } = turretSlotPosition(side, slotIndex);
    const artId = turretArtId(definition.spriteKey);
    ensureTurretArt(scene, artId, turretState.level, side);
    super(scene, x, y, turretMountKey(artId, turretState.level, side));
    this.side = side;
    this.slotIndex = slotIndex;
    this.definition = definition;
    this.turretState = turretState;
    this.sideState = sideState;
    this.artId = artId;
    this.motion = TURRET_MOTION[artId];
    this.dir = laneDir(side);
    this.aim = this.motion.rest;
    this.aimTarget = this.motion.rest;
    const k = 1 / TURRET_SUPERSAMPLE;
    this.setOrigin(flipOriginX(TURRET_MOUNT_ORIGIN.x, side === 'enemy'), TURRET_MOUNT_ORIGIN.y).setScale(k).setFlipX(side === 'enemy').setDepth(2);
    scene.add.existing(this);
    this.head = scene.add
      .image(0, 0, turretHeadKey(artId, turretState.level, side))
      .setOrigin(flipOriginX(TURRET_HEAD_ORIGIN.x, side === 'enemy'), TURRET_HEAD_ORIGIN.y)
      .setScale(k)
      .setFlipX(side === 'enemy')
      .setDepth(2.1);
    this.flash =
      this.motion.flash === 'none'
        ? null
        : scene.add
            .image(0, 0, turretFlashKey(this.motion.flash))
            .setOrigin(flipOriginX(TURRET_FLASH_ORIGIN.x, side === 'enemy'), TURRET_FLASH_ORIGIN.y)
            .setScale(k)
            .setFlipX(side === 'enemy')
            .setDepth(2.2)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setVisible(false);
    this.pips = scene.add.graphics().setDepth(2.5);
    this.showLevel();
    this.placeHead(Infinity);
  }

  /** Redraws the level: its art and the level dots. Call after an upgrade. */
  showLevel(): void {
    const level = this.turretState.level;
    ensureTurretArt(this.scene, this.artId, level, this.side);
    this.setTexture(turretMountKey(this.artId, level, this.side));
    this.head?.setTexture(turretHeadKey(this.artId, level, this.side));
    this.pips.clear();
    for (let i = 0; i < level; i++) {
      const x = this.x - (level - 1) * 4 + i * 8;
      this.pips.fillStyle(0x000000, 0.6);
      this.pips.fillCircle(x, this.y + 4, 3);
      this.pips.fillStyle(0xf2c744, 1);
      this.pips.fillCircle(x, this.y + 4, 2);
    }
  }

  /**
   * Visual only: turn toward the enemy at (x, y), or back to rest with no
   * target. Throwing arms and cauldrons don't track.
   */
  track(x: number | null, y = 0): void {
    if (this.motion.aim !== 'track') return;
    if (x === null) {
      this.aimTarget = this.motion.rest;
      return;
    }
    this.aimTarget = this.angleTo(x, y);
  }

  /** Visual only: the shot leaves now (snap to the aim, recoil or swing, flash). */
  playFire(): void {
    if (this.motion.aim === 'track') this.aim = this.aimTarget;
    this.firedAt = this.scene.time.now;
  }

  preUpdate(_time: number, delta: number): void {
    const step = (TURN_RATE * delta) / 1000;
    this.aim += Phaser.Math.Clamp(this.aimTarget - this.aim, -step, step);
    this.placeHead(this.scene.time.now - this.firedAt);
  }

  override destroy(fromScene?: boolean): void {
    this.pips.destroy(fromScene);
    this.head.destroy(fromScene);
    this.flash?.destroy(fromScene);
    super.destroy(fromScene);
  }

  /**
   * The single accessor for turret stats: the definition's value times the
   * multipliers of every upgrade bought so far (none until Phase 11).
   */
  getStat(stat: TurretStat): number {
    const upgrades = this.definition.upgrades.slice(0, this.turretState.level);
    switch (stat) {
      case 'damage':
        return (
          upgrades.reduce((value, u) => value * u.damageMult, this.definition.damage) *
          researchMult('turretDamage', this.sideState.research.turretDamage) *
          TURRET_DAMAGE_MULT
        );
      case 'cooldown':
        return upgrades.reduce((value, u) => value * u.cooldownMult, this.definition.cooldownMs);
      case 'range':
        return this.definition.range * researchMult('turretRange', this.sideState.research.turretRange);
    }
  }

  /** Where shots leave the turret: the muzzle at the firing angle. */
  get muzzleX(): number {
    return this.pivotX + this.dir * Math.cos(this.fireAngle) * this.motion.barrel;
  }

  get muzzleY(): number {
    return this.pivotY - Math.sin(this.fireAngle) * this.motion.barrel;
  }

  private get pivotX(): number {
    return this.x + this.dir * this.motion.pivot[0];
  }

  private get pivotY(): number {
    return this.y + this.motion.pivot[1];
  }

  /** The head angle shots leave at (arms and cauldrons: their release angle). */
  private get fireAngle(): number {
    return this.motion.aim === 'track' ? this.aimTarget : (this.motion.release ?? this.motion.rest);
  }

  private angleTo(x: number, y: number): number {
    const angle = Math.atan2(-(y - this.pivotY), (x - this.pivotX) * this.dir);
    return Phaser.Math.Clamp(angle, this.motion.minAim, this.motion.maxAim);
  }

  /** Positions the head (and flash) for `sinceFire` real ms after the last shot. */
  private placeHead(sinceFire: number): void {
    const m = this.motion;
    let angle = this.aim;
    let kick = 0;
    if (m.aim === 'track') {
      if (sinceFire < RECOIL_MS) {
        const k = sinceFire / RECOIL_MS;
        kick = m.recoil * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      }
    } else {
      const release = m.release ?? m.rest;
      const { out, hold, back } = SWING_MS;
      if (sinceFire < out) angle = Phaser.Math.Linear(m.rest, release, sinceFire / out);
      else if (sinceFire < out + hold) angle = release;
      else if (sinceFire < out + hold + back) {
        const k = (sinceFire - out - hold) / back;
        angle = Phaser.Math.Linear(release, m.rest, 1 - (1 - k) * (1 - k));
      } else angle = m.rest;
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hx = this.pivotX - this.dir * cos * kick;
    const hy = this.pivotY + sin * kick;
    this.head.setPosition(hx, hy).setRotation(this.dir === 1 ? -angle : angle);
    if (!this.flash) return;
    const show = sinceFire < FLASH_MS;
    this.flash.setVisible(show);
    if (show) {
      const reach = m.barrel - kick;
      this.flash
        .setPosition(hx + this.dir * cos * reach, hy - sin * reach)
        .setRotation(this.dir === 1 ? -angle : angle)
        .setAlpha(1 - sinceFire / FLASH_MS);
    }
  }
}
