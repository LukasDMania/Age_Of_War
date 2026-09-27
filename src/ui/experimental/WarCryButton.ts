import Phaser from 'phaser';
import { WAR_CRY } from '@config/experiments.config';
import type { Side } from '@state/types';
import { UI_FONT, UI_TITLE_FONT, UiColors, UiTextColors } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import { keyHint } from '@ui/keymap';
import { emit, Events, on } from '@utils/EventBus';

/**
 * HUD button for the War Cry (prototype, feature `warCry`): a small square
 * next to the special with a draining cooldown overlay. Press it or W to
 * emit `war-cry-requested`; listens for `war-cry-cooldown-changed`.
 */
export class WarCryButton {
  private readonly button: UiButton;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly seconds: Phaser.GameObjects.Text;
  private readonly size: number;
  private readonly cleanups: (() => void)[];

  constructor(scene: Phaser.Scene, side: Side, x: number, y: number, size: number) {
    this.size = size;
    const half = size / 2;
    this.button = new UiButton(scene, x, y, size, size, {
      onPress: () => emit(Events.WarCryRequested, { side }),
      hoverTint: UiColors.ready,
      framed: true,
    });
    const horn = scene.add.graphics();
    horn.fillStyle(0xe8c04a, 1).lineStyle(2, 0x1a120c, 1);
    horn.beginPath();
    horn.moveTo(-18, -8);
    horn.lineTo(10, -16);
    horn.lineTo(10, 10);
    horn.lineTo(-18, 2);
    horn.closePath();
    horn.fillPath();
    horn.strokePath();
    horn.fillStyle(0x8b5a2b, 1).fillRect(-24, -6, 7, 7).strokeRect(-24, -6, 7, 7);
    for (const [dx, dy] of [[16, -14], [20, -3], [16, 8]] as const) horn.lineStyle(2, 0xff8a3a, 1).lineBetween(dx, dy, dx + 7, dy + (dy < 0 ? -3 : dy > 0 ? 3 : 0));
    horn.setPosition(0, -8);
    this.overlay = scene.add.graphics();
    this.seconds = scene.add
      .text(0, -6, '', { fontFamily: UI_TITLE_FONT, fontSize: '22px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 })
      .setOrigin(0.5);
    this.button.add(
      scene.add.text(-half + 6, -half + 4, keyHint('war-cry'), { fontFamily: UI_FONT, fontSize: '11px', color: UiTextColors.dim }),
      horn,
      scene.add.text(0, half - 14, 'War Cry', { fontFamily: UI_FONT, fontSize: '12px', fontStyle: '600', color: UiTextColors.parchment }).setOrigin(0.5),
      this.overlay,
      this.seconds,
    );
    this.cleanups = [
      on(Events.WarCryCooldownChanged, ({ side: s, remainingMs, totalMs }) => {
        if (s === side) this.setCooldown(remainingMs, totalMs);
      }),
    ];
    this.setCooldown(WAR_CRY.firstReadyMs, WAR_CRY.cooldownMs);
  }

  setLocked(locked: boolean): void {
    this.button.setEnabled(!locked);
  }

  /** Presses the button as a click would (keyboard). */
  press(): void {
    this.button.press();
  }

  destroy(): void {
    for (const off of this.cleanups) off();
    this.button.destroy();
  }

  private setCooldown(remainingMs: number, totalMs: number): void {
    const half = this.size / 2;
    const k = Math.min(1, remainingMs / Math.max(1, totalMs));
    this.overlay.clear();
    if (k > 0) this.overlay.fillStyle(0x000000, 0.55).fillRect(-half + 3, -half + 3 + (1 - k) * (this.size - 6), this.size - 6, k * (this.size - 6));
    this.seconds.setText(remainingMs > 0 ? String(Math.ceil(remainingMs / 1000)) : '');
  }
}
