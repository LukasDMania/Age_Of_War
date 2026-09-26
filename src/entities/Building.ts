import Phaser from 'phaser';
import { BUILDINGS, BUILDING_LAYOUT, MAX_BUILDING_LEVEL, type BuildingId } from '@config/buildings.config';
import { LANE_Y } from '@config/constants';
import type { Side } from '@state/types';
import { textureKeyFor } from '@utils/PlaceholderArt';

/**
 * The picture of one building behind a base (Phase 14): its sprite, name and
 * level pips. Rules live in `BuildingSystem`; this only shows the level it is
 * given. An unbuilt building shows as a faded outline of itself.
 */
export class Building extends Phaser.GameObjects.Container {
  readonly side: Side;
  readonly buildingId: BuildingId;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly pips: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, side: Side, buildingId: BuildingId, x: number) {
    super(scene, x, LANE_Y);
    this.side = side;
    this.buildingId = buildingId;
    const def = BUILDINGS[buildingId];
    this.sprite = scene.add.image(0, 0, textureKeyFor(def.spriteKey, side)).setOrigin(0.5, 1);
    this.label = scene.add
      .text(0, -BUILDING_LAYOUT.size.h - 30, def.name, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#f1e4c3',
        stroke: '#2a2233',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.pips = scene.add.graphics();
    this.add([this.sprite, this.label, this.pips]);
    this.setDepth(0.5);
    scene.add.existing(this);
    this.setLevel(0);
  }

  setLevel(level: number): void {
    this.sprite.setAlpha(level > 0 ? 1 : 0.3);
    this.label.setText(level > 0 ? BUILDINGS[this.buildingId].name : `${BUILDINGS[this.buildingId].name} (not built)`);
    this.pips.clear();
    const y = -BUILDING_LAYOUT.size.h - 12;
    for (let i = 0; i < MAX_BUILDING_LEVEL; i++) {
      const x = (i - (MAX_BUILDING_LEVEL - 1) / 2) * 12;
      this.pips.fillStyle(0x000000, 0.6);
      this.pips.fillCircle(x, y, 5);
      if (i < level) {
        this.pips.fillStyle(0xf2c744, 1);
        this.pips.fillCircle(x, y, 3.5);
      }
    }
  }
}
