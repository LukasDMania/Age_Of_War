import Phaser from 'phaser';
import { MECH_MODULES, type ModuleId } from '@config/mech.config';
import type { Side } from '@state/types';
import { UI_FONT, UI_TITLE_FONT, UiColors, UiTextColors } from '@ui/kenneyUi';
import { keyHint } from '@ui/keymap';
import { UiButton } from '@ui/UiButton';
import { emit, Events, on } from '@utils/EventBus';

/**
 * The Mech's Special module on the HUD (Mech expansion section 4): while a
 * Mech with a module is on the lane, this button takes the War cry's place
 * (and its key) and fires the module with `mech-ability-requested`; a
 * draining overlay shows the recharge. Hidden otherwise.
 *
 * Listens for: `mech-ability-changed`. Emits: `mech-ability-requested`.
 */
export class MechAbilityButton {
  private readonly button: UiButton;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly seconds: Phaser.GameObjects.Text;
  private readonly name: Phaser.GameObjects.Text;
  private readonly size: number;
  private readonly cleanups: (() => void)[];
  private moduleId: string | null = null;
  private onShow: (shown: boolean) => void;

  constructor(scene: Phaser.Scene, side: Side, x: number, y: number, size: number, onShow: (shown: boolean) => void) {
    this.size = size;
    this.onShow = onShow;
    const half = size / 2;
    this.button = new UiButton(scene, x, y, size, size, {
      onPress: () => emit(Events.MechAbilityRequested, { side }),
      tint: UiColors.ready,
      hoverTint: UiColors.panelHover,
      framed: true,
    });
    const gear = scene.add.graphics();
    gear.fillStyle(0x9fd0ff, 1).lineStyle(2, 0x1a120c, 1);
    gear.fillCircle(0, -10, 14).strokeCircle(0, -10, 14);
    gear.fillStyle(0x1a2a3a, 1).fillCircle(0, -10, 6);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      gear.fillStyle(0x9fd0ff, 1).fillRect(Math.cos(a) * 16 - 2.5, -10 + Math.sin(a) * 16 - 2.5, 5, 5);
    }
    this.overlay = scene.add.graphics();
    this.seconds = scene.add
      .text(0, -8, '', { fontFamily: UI_TITLE_FONT, fontSize: '22px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 })
      .setOrigin(0.5);
    this.name = scene.add
      .text(0, half - 14, '', { fontFamily: UI_FONT, fontSize: '11px', fontStyle: '600', color: UiTextColors.parchment })
      .setOrigin(0.5);
    this.button.add(
      scene.add.text(-half + 6, -half + 4, keyHint('war-cry'), { fontFamily: UI_FONT, fontSize: '11px', color: UiTextColors.dim }),
      gear,
      this.name,
      this.overlay,
      this.seconds,
    );
    this.button.container.setVisible(false);
    this.cleanups = [
      on(Events.MechAbilityChanged, ({ side: s, moduleId, remainingMs, totalMs }) => {
        if (s !== side) return;
        this.setModule(moduleId);
        this.setCooldown(remainingMs, totalMs);
      }),
    ];
  }

  /** Whether a module is out (the button is shown). */
  get active(): boolean {
    return this.moduleId !== null;
  }

  setLocked(locked: boolean): void {
    this.button.setEnabled(!locked);
  }

  press(): boolean {
    if (!this.active) return false;
    this.button.press();
    return true;
  }

  destroy(): void {
    for (const off of this.cleanups) off();
    this.button.destroy();
  }

  private setModule(moduleId: string | null): void {
    if (moduleId === this.moduleId) return;
    this.moduleId = moduleId;
    const shown = moduleId !== null;
    this.button.container.setVisible(shown);
    if (shown) {
      this.name.setText(MECH_MODULES[moduleId as ModuleId]?.name ?? 'Module').setScale(1);
      if (this.name.width > this.size - 8) this.name.setScale((this.size - 8) / this.name.width);
    }
    this.onShow(shown);
  }

  private setCooldown(remainingMs: number, totalMs: number): void {
    const half = this.size / 2;
    const k = Math.min(1, remainingMs / Math.max(1, totalMs));
    this.overlay.clear();
    if (k > 0) this.overlay.fillStyle(0x000000, 0.55).fillRect(-half + 3, -half + 3 + (1 - k) * (this.size - 6), this.size - 6, k * (this.size - 6));
    this.seconds.setText(remainingMs > 0 ? String(Math.ceil(remainingMs / 1000)) : '');
  }
}
