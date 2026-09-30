import Phaser from 'phaser';
import { BUILDINGS, BUILDING_LAYOUT, buildingStage, LEVELS_PER_AGE, type BuildingId } from '@config/buildings.config';
import { LANE_Y } from '@config/constants';
import type { Side } from '@state/types';
import { UI_FONT, UI_TITLE_FONT } from '@ui/kenneyUi';
import {
  BUILDING_ORIGIN_Y,
  BUILDING_SUPERSAMPLE,
  ensureBuildingArt,
  releaseBuildingArt,
} from '@utils/BuildingArt';

/**
 * The picture of one building behind a base (Phase 14; rig art with stages
 * since 2026-09-26): its art at the current level (the look changes every
 * five levels, and each level adds a small prop), its name, the level and
 * five pips for the levels of the current stage. An unbuilt building is a
 * faded outline of its first stage. Levelling up bounces it; reaching a new
 * stage bounces it harder (effects come from `ImpactEffects`). Rules live in
 * `BuildingSystem`; this only shows what it is told.
 */
export class Building extends Phaser.GameObjects.Container {
  readonly side: Side;
  readonly buildingId: BuildingId;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly pips: Phaser.GameObjects.Graphics;
  private readonly badge: Phaser.GameObjects.Text;
  /** Shown while a utility Mech works here (or walks here). */
  private readonly assistBadge: Phaser.GameObjects.Text;
  private level = -1;
  private artKey = '';

  constructor(scene: Phaser.Scene, side: Side, buildingId: BuildingId, x: number) {
    super(scene, x, LANE_Y);
    this.side = side;
    this.buildingId = buildingId;
    const def = BUILDINGS[buildingId];
    this.sprite = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, BUILDING_ORIGIN_Y).setScale(1 / BUILDING_SUPERSAMPLE);
    const top = -BUILDING_LAYOUT.size.h - 30;
    this.label = scene.add
      .text(0, top, def.name, {
        fontFamily: UI_TITLE_FONT,
        fontSize: '17px',
        color: '#fff0c8',
        stroke: '#241408',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.levelText = scene.add
      .text(0, top + 17, '', { fontFamily: UI_FONT, fontSize: '12px', fontStyle: '600', color: '#f7cf5a', stroke: '#241408', strokeThickness: 3 })
      .setOrigin(0.5);
    this.pips = scene.add.graphics();
    this.badge = scene.add
      .text(0, top - 22, 'PERK!', { fontFamily: UI_TITLE_FONT, fontSize: '13px', color: '#241408', backgroundColor: '#f7cf5a', padding: { x: 4, y: 1 } })
      .setOrigin(0.5)
      .setVisible(false);
    scene.tweens.add({ targets: this.badge, scale: 1.15, duration: 500, yoyo: true, repeat: -1 });
    this.assistBadge = scene.add
      .text(0, top - 44, '', { fontFamily: UI_FONT, fontSize: '12px', fontStyle: '600', color: '#241408', backgroundColor: '#9fd0ff', padding: { x: 4, y: 1 } })
      .setOrigin(0.5)
      .setVisible(false);
    this.add([this.sprite, this.label, this.levelText, this.pips, this.badge, this.assistBadge]);
    this.setDepth(0.5);
    scene.add.existing(this);
    this.setLevel(0);
  }

  /** Calls `handler` when the building is clicked (sends a utility Mech here). */
  onPress(handler: () => void): this {
    this.sprite.setInteractive({ useHandCursor: true }).on('pointerdown', handler);
    return this;
  }

  /** A utility Mech's work here: 'working', 'coming', or null (none). */
  setAssist(state: 'working' | 'coming' | null, secondsLeft = 0): void {
    this.assistBadge.setVisible(state !== null);
    if (state) this.assistBadge.setText(state === 'working' ? `Mech at work ${secondsLeft}s` : 'Mech on the way');
  }

  setLevel(level: number): void {
    const previous = this.level;
    this.level = level;
    const key = ensureBuildingArt(this.scene, this.buildingId, level, this.side);
    this.sprite.setTexture(key).setAlpha(level > 0 ? 1 : 0.3);
    if (this.artKey && this.artKey !== key) releaseBuildingArt(this.scene, this.artKey);
    this.artKey = key;
    this.label.setAlpha(level > 0 ? 1 : 0.6);
    this.levelText.setText(level > 0 ? `Level ${level}` : '');
    this.pips.clear();
    if (level > 0) {
      const inStage = ((level - 1) % LEVELS_PER_AGE) + 1;
      const y = -BUILDING_LAYOUT.size.h - 2;
      for (let i = 0; i < LEVELS_PER_AGE; i++) {
        const x = (i - (LEVELS_PER_AGE - 1) / 2) * 11;
        this.pips.fillStyle(0x000000, 0.55).fillCircle(x, y, 4.5);
        if (i < inStage) this.pips.fillStyle(0xf2c744, 1).fillCircle(x, y, 3.2);
      }
    }
    if (previous >= 0 && level > previous) {
      // A new stage (every five levels) earns a bigger bounce.
      const newStage = buildingStage(level) !== buildingStage(previous);
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: (1 / BUILDING_SUPERSAMPLE) * (newStage ? 1.14 : 1.06),
        scaleY: (1 / BUILDING_SUPERSAMPLE) * (newStage ? 0.9 : 0.96),
        duration: newStage ? 140 : 90,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }
  }

  /** Shows the "PERK!" badge while a perk is waiting to be picked (player only). */
  setPerkPending(pending: boolean): void {
    this.badge.setVisible(pending);
  }

  override destroy(fromScene?: boolean): void {
    if (this.artKey && this.scene) releaseBuildingArt(this.scene, this.artKey);
    super.destroy(fromScene);
  }
}

