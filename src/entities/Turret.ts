import Phaser from 'phaser';
import { BASE_X, TURRET_DAMAGE_MULT, TURRET_SLOT_LAYOUT } from '@config/constants';
import { getTurretDefinition, type TurretDefinition } from '@entities/turretDefinitions';
import { researchMult } from '@config/buildings.config';
import type { SideState, TurretState } from '@state/GameState';
import { laneDir, type Side } from '@state/types';
import { textureKeyFor } from '@utils/PlaceholderArt';

/** Turret stats that upgrades (Phase 11) can change. */
export type TurretStat = 'damage' | 'cooldown' | 'range';

/** Bottom-center of a turret slot on a side's base. */
export function turretSlotPosition(side: Side, slotIndex: number): { x: number; y: number } {
  return {
    x: BASE_X[side] + laneDir(side) * TURRET_SLOT_LAYOUT.offsetX,
    y: TURRET_SLOT_LAYOUT.firstY - slotIndex * TURRET_SLOT_LAYOUT.spacingY,
  };
}

/**
 * A built turret: a sprite in one of its base's slots, plus the definition
 * and fire timer. Its persistent part (id, upgrade level, gold spent) is the
 * `TurretState` in `SideState.turrets`, which this object reads. Targeting
 * and firing rules live in `TurretSystem`.
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

  constructor(scene: Phaser.Scene, side: Side, slotIndex: number, turretState: TurretState, sideState: SideState) {
    const definition = getTurretDefinition(turretState.turretId);
    const { x, y } = turretSlotPosition(side, slotIndex);
    super(scene, x, y, textureKeyFor(definition.spriteKey, side));
    this.side = side;
    this.slotIndex = slotIndex;
    this.definition = definition;
    this.turretState = turretState;
    this.sideState = sideState;
    this.setOrigin(0.5, 1).setFlipX(side === 'enemy').setDepth(2);
    scene.add.existing(this);
    this.pips = scene.add.graphics().setDepth(2.5);
    this.showLevel();
  }

  /** Redraws the level dots; call after an upgrade. */
  showLevel(): void {
    this.pips.clear();
    const level = this.turretState.level;
    for (let i = 0; i < level; i++) {
      const x = this.x - (level - 1) * 4 + i * 8;
      this.pips.fillStyle(0x000000, 0.6);
      this.pips.fillCircle(x, this.y - 4, 3.5);
      this.pips.fillStyle(0xf2c744, 1);
      this.pips.fillCircle(x, this.y - 4, 2.5);
    }
  }

  override destroy(fromScene?: boolean): void {
    this.pips.destroy(fromScene);
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

  /** Where shots leave the turret. */
  get muzzleX(): number {
    return this.x + laneDir(this.side) * 16;
  }

  get muzzleY(): number {
    return this.y - this.displayHeight * 0.6;
  }
}
