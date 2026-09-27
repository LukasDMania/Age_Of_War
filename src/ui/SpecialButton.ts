import Phaser from 'phaser';
import { getAge } from '@config/ages.config';
import type { Side } from '@state/types';
import { fitImage, UI_FONT, UiColors, UiTextColors } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import { keyHint } from '@ui/keymap';
import { emit, Events } from '@utils/EventBus';

/**
 * The special attack button: the current age's special (name and strike
 * icon), a dark overlay that drains as the cooldown runs out, and the
 * seconds left. Press it (or S) to emit `special-requested`; `SpecialSystem`
 * decides. Updated by `HUDScene` from `special-cooldown-changed`.
 */
export class SpecialButton {
  private readonly side: Side;
  private readonly size: number;
  private readonly button: UiButton;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly name: Phaser.GameObjects.Text;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly seconds: Phaser.GameObjects.Text;
  private coolingDown = false;
  private locked = false;

  /** (x, y) is the button's center; it is `size` px square. */
  constructor(scene: Phaser.Scene, side: Side, x: number, y: number, size: number, age: number) {
    this.side = side;
    this.size = size;
    const half = size / 2;
    this.button = new UiButton(scene, x, y, size, size, {
      onPress: () => emit(Events.SpecialRequested, { side: this.side }),
      hoverTint: UiColors.ready,
      framed: true,
    });
    const title = scene.add
      .text(-half + 8, -half + 6, 'Special', { fontFamily: UI_FONT, fontSize: '12px', color: UiTextColors.dim });
    const key = scene.add
      .text(half - 8, -half + 6, keyHint('special'), { fontFamily: UI_FONT, fontSize: '12px', color: UiTextColors.dim })
      .setOrigin(1, 0);
    this.icon = scene.add.image(0, -4, '__DEFAULT').setRotation(Math.PI / 4);
    this.name = scene.add
      .text(0, half - 18, '', { fontFamily: UI_FONT, fontSize: '11px', color: UiTextColors.parchment })
      .setOrigin(0.5);
    this.overlay = scene.add.graphics();
    this.seconds = scene.add
      .text(0, -4, '', {
        fontFamily: UI_FONT,
        fontSize: '26px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.button.add(title, key, this.icon, this.name, this.overlay, this.seconds);
    this.setAge(age);
    this.setCooldown(0, 1);
  }

  /** Shows the special of the given age. */
  setAge(age: number): void {
    const special = getAge(age).special;
    this.icon.setTexture(special.projectileKey);
    fitImage(this.icon, this.size - 40, this.size - 40);
    this.name.setText(special.name);
  }

  setCooldown(remainingMs: number, totalMs: number): void {
    this.coolingDown = remainingMs > 0;
    const ratio = totalMs > 0 ? Phaser.Math.Clamp(remainingMs / totalMs, 0, 1) : 0;
    const half = this.size / 2;
    this.overlay.clear();
    if (this.coolingDown) {
      // The dark part shrinks from the top as the special recharges.
      const h = (this.size - 8) * ratio;
      this.overlay.fillStyle(0x000000, 0.55);
      this.overlay.fillRect(-half + 4, half - 4 - h, this.size - 8, h);
    }
    this.seconds.setText(this.coolingDown ? `${Math.ceil(remainingMs / 1000)}` : '');
    this.refresh();
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.refresh();
  }

  /** Presses the button as a click would (keyboard). */
  press(): void {
    this.button.press();
  }

  destroy(): void {
  }

  private refresh(): void {
    const ready = !this.locked && !this.coolingDown;
    this.button.setEnabled(ready);
    // Highlighted when ready. While cooling down the overlay already shows it,
    // so keep the icon readable; only the lock (pause, game over) dims it.
    this.button.setSelected(ready);
    if (this.coolingDown && !this.locked) this.button.container.setAlpha(1);
  }
}
