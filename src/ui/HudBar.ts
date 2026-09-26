import Phaser from 'phaser';
import { addPanel, UI_FONT, UiColors, UiTextures } from '@ui/kenneyUi';

export interface HudBarOptions {
  /** Fixed fill color. Ignored when `colorByRatio` is set. */
  color?: number;
  /** Green above half, yellow above a quarter, red below (for HP). */
  colorByRatio?: boolean;
}

/**
 * A horizontal meter with a Kenney frame and a centered value label, used for
 * the XP and base HP bars. Positioned by its left edge and vertical center.
 * Purely visual: the owner calls `setValue` when an event says it changed.
 */
export class HudBar {
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly width: number;
  private readonly height: number;
  private readonly options: HudBarOptions;

  constructor(
    scene: Phaser.Scene,
    left: number,
    centerY: number,
    width: number,
    height: number,
    options: HudBarOptions = {},
  ) {
    this.width = width;
    this.height = height;
    this.options = options;
    this.fill = scene.add.graphics().setPosition(left, centerY - height / 2);
    addPanel(scene, UiTextures.frame, left + width / 2, centerY, width + 8, height + 8, UiColors.gold);
    this.label = scene.add
      .text(left + width / 2, centerY, '', {
        fontFamily: UI_FONT,
        fontSize: `${Math.max(10, height - 2)}px`,
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
  }

  /** Redraws the fill for `value / max` and sets the label text. */
  setValue(value: number, max: number, text: string): void {
    const ratio = max > 0 ? Phaser.Math.Clamp(value / max, 0, 1) : 0;
    let color = this.options.color ?? UiColors.good;
    if (this.options.colorByRatio) {
      color = ratio > 0.5 ? UiColors.good : ratio > 0.25 ? UiColors.warn : UiColors.bad;
    }
    this.fill.clear();
    this.fill.fillStyle(0x000000, 0.65);
    this.fill.fillRect(0, 0, this.width, this.height);
    this.fill.fillStyle(color, 1);
    this.fill.fillRect(0, 0, this.width * ratio, this.height);
    this.label.setText(text);
  }
}
