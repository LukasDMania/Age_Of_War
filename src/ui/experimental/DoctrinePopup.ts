import Phaser from 'phaser';
import { GAME_WIDTH } from '@config/constants';
import type { Side } from '@state/types';
import { findDoctrine } from '@systems/experimental/DoctrineSystem';
import { addThemedPanel, UI_FONT, UI_TITLE_FONT, UiTextColors } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import { emit, Events, on } from '@utils/EventBus';

/**
 * Doctrine choice (prototype, feature `ageDoctrines`): after the player ages
 * up, three doctrine cards appear under the top panels; pick one (click or
 * keys 7 / 8 / 9). Emits `choose-doctrine-requested`; closes on
 * `doctrine-chosen`. The match keeps running meanwhile.
 */
export class DoctrinePopup {
  private readonly scene: Phaser.Scene;
  private readonly side: Side;
  private panel: Phaser.GameObjects.Container | null = null;
  private options: readonly string[] = [];
  private readonly cleanups: (() => void)[];
  private readonly keys = ['SEVEN', 'EIGHT', 'NINE'] as const;
  private readonly keyHandlers: (() => void)[];

  constructor(scene: Phaser.Scene, side: Side) {
    this.scene = scene;
    this.side = side;
    this.keyHandlers = this.keys.map((_, i) => () => this.pick(i));
    this.keys.forEach((key, i) => scene.input.keyboard?.on(`keydown-${key}`, this.keyHandlers[i]!));
    this.cleanups = [
      on(Events.DoctrineOffered, ({ side: s, options }) => {
        if (s === this.side) this.show(options);
      }),
      on(Events.DoctrineChosen, ({ side: s }) => {
        if (s === this.side) this.close();
      }),
    ];
  }

  destroy(): void {
    for (const off of this.cleanups) off();
    this.keys.forEach((key, i) => this.scene.input.keyboard?.off(`keydown-${key}`, this.keyHandlers[i]!));
    this.close();
  }

  private pick(index: number): void {
    const id = this.options[index];
    if (this.panel && id) emit(Events.ChooseDoctrineRequested, { side: this.side, doctrineId: id });
  }

  private show(options: readonly string[]): void {
    this.close();
    this.options = options;
    const cx = GAME_WIDTH / 2;
    const width = 250;
    const gap = 14;
    const total = options.length * width + (options.length - 1) * gap;
    // Below the age-up banner, above the lane.
    const panel = this.scene.add.container(cx, 330).setDepth(45);
    panel.add(addThemedPanel(this.scene, 0, 0, total + 40, 150, { alpha: 0.97 }));
    panel.add(
      this.scene.add
        .text(0, -56, 'Choose a doctrine for this age', {
          fontFamily: UI_TITLE_FONT,
          fontSize: '22px',
          color: UiTextColors.gold,
          stroke: UiTextColors.stroke,
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    );
    options.forEach((id, i) => {
      const d = findDoctrine(id);
      if (!d) return;
      const x = -total / 2 + width / 2 + i * (width + gap);
      const button = new UiButton(this.scene, x, 14, width, 80, {
        onPress: () => emit(Events.ChooseDoctrineRequested, { side: this.side, doctrineId: id }),
        framed: true,
      });
      button.add(
        this.scene.add.text(-width / 2 + 8, -34, String(7 + i), { fontFamily: UI_FONT, fontSize: '11px', color: UiTextColors.dim }),
        this.scene.add.text(0, -14, d.name, { fontFamily: UI_TITLE_FONT, fontSize: '20px', color: UiTextColors.parchment }).setOrigin(0.5),
        this.scene.add
          .text(0, 14, d.about, { fontFamily: UI_FONT, fontSize: '13px', fontStyle: '600', color: UiTextColors.gold, align: 'center', wordWrap: { width: width - 16 } })
          .setOrigin(0.5),
      );
      panel.add(button.container);
    });
    panel.setAlpha(0).setScale(0.9);
    this.scene.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.panel = panel;
  }

  private close(): void {
    this.panel?.destroy();
    this.panel = null;
    this.options = [];
  }
}
