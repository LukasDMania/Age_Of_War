import Phaser from 'phaser';
import { addPanel, UiColors, UiTextures } from '@ui/kenneyUi';

export interface UiButtonOptions {
  onPress: () => void;
  texture?: typeof UiTextures.panel | typeof UiTextures.panelGlass;
  tint?: number;
  hoverTint?: number;
  /** Called when the pointer enters (true) or leaves (false). */
  onHover?: (over: boolean) => void;
  /** Adds the theme's ornate trim frame around the button (2026-09-26). */
  framed?: boolean;
}

const DISABLED_ALPHA = 0.4;

/**
 * A Kenney-panel button: a tinted nine-slice background plus whatever
 * children are added, grouped in a container centered on (x, y). It greys
 * out when disabled, ignores presses then, and gives a small press bounce.
 * Purely UI: `onPress` is expected to emit a `*-requested` event.
 */
export class UiButton {
  readonly container: Phaser.GameObjects.Container;
  readonly background: Phaser.GameObjects.NineSlice;
  private readonly scene: Phaser.Scene;
  private readonly options: UiButtonOptions;
  private enabled = true;
  private selected = false;
  private hovered = false;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, options: UiButtonOptions) {
    this.scene = scene;
    this.options = options;
    this.container = scene.add.container(x, y);
    this.background = addPanel(
      scene,
      options.texture ?? UiTextures.panel,
      0,
      0,
      width,
      height,
      options.tint ?? UiColors.panelMid,
    );
    this.container.add(this.background);
    if (options.framed) {
      const frame = scene.add.nineslice(0, 0, UiTextures.frameOrnate, undefined, width + 6, height + 6, 12, 12, 12, 12);
      frame.setTint(UiColors.trim);
      this.container.add(frame);
    }
    this.background.setInteractive({ useHandCursor: true });
    this.background.on('pointerover', () => {
      this.hovered = true;
      this.refreshTint();
      options.onHover?.(true);
    });
    this.background.on('pointerout', () => {
      this.hovered = false;
      this.refreshTint();
      options.onHover?.(false);
    });
    this.background.on('pointerdown', () => this.press());
  }

  add(...children: Phaser.GameObjects.GameObject[]): this {
    this.container.add(children);
    return this;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.container.setAlpha(enabled ? 1 : DISABLED_ALPHA);
    this.refreshTint();
    return this;
  }

  /** Highlights the button (used for the active tab). */
  setSelected(selected: boolean): this {
    this.selected = selected;
    this.refreshTint();
    return this;
  }

  /** Presses the button as a click would (keyboard shortcuts use this). */
  press(): void {
    if (!this.enabled) return;
    this.options.onPress();
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: 0.93, to: 1 },
      duration: 120,
      ease: 'Quad.easeOut',
    });
  }

  destroy(): void {
    this.container.destroy();
  }

  private refreshTint(): void {
    const base = this.options.tint ?? UiColors.panelMid;
    const hover = this.options.hoverTint ?? UiColors.panelHover;
    this.background.setTint(this.selected || (this.hovered && this.enabled) ? hover : base);
  }
}
