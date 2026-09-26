import Phaser from 'phaser';
import { feature, FEATURE_IDS, FEATURES_INFO, setFeature } from '@config/features.config';
import { GAME_HEIGHT, GAME_WIDTH } from '@config/constants';
import { addThemedPanel, UI_FONT, UI_TITLE_FONT, UiColors, UiTextColors } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';

/**
 * The title menu's Experiments panel (2026-09-26): one switch per prototype
 * system (`config/features.config.ts`), remembered in this browser. Changes
 * apply to the next match.
 */
export class ExperimentsPanel {
  private readonly scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  toggle(): void {
    if (this.root) this.close();
    else this.open();
  }

  close(): void {
    this.root?.destroy();
    this.root = null;
  }

  private open(): void {
    const width = 720;
    const rowH = 58;
    const height = 110 + FEATURE_IDS.length * rowH;
    const root = this.scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(100);
    root.add(this.scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5).setInteractive());
    root.add(addThemedPanel(this.scene, 0, 0, width, height, { alpha: 0.98 }));
    root.add([
      this.scene.add
        .text(0, -height / 2 + 30, 'Experiments (prototype systems)', {
          fontFamily: UI_TITLE_FONT,
          fontSize: '26px',
          color: UiTextColors.gold,
          stroke: UiTextColors.stroke,
          strokeThickness: 5,
        })
        .setOrigin(0.5),
      this.scene.add
        .text(0, -height / 2 + 58, 'Each can be switched off; changes apply to the next match.', {
          fontFamily: UI_FONT,
          fontSize: '14px',
          color: UiTextColors.dim,
        })
        .setOrigin(0.5),
    ]);
    FEATURE_IDS.forEach((id, i) => {
      const info = FEATURES_INFO[id];
      const y = -height / 2 + 100 + i * rowH;
      const onOff = this.scene.add.text(0, 0, '', { fontFamily: UI_TITLE_FONT, fontSize: '16px', color: UiTextColors.parchment }).setOrigin(0.5);
      const button = new UiButton(this.scene, -width / 2 + 60, y + 10, 72, 34, {
        onPress: () => {
          setFeature(id, !feature(id));
          refresh();
        },
        framed: true,
      });
      button.add(onOff);
      const refresh = (): void => {
        const on = feature(id);
        onOff.setText(on ? 'ON' : 'OFF').setColor(on ? '#8fe08f' : '#f08a80');
        button.background.setTint(on ? UiColors.ready : UiColors.panelDark);
      };
      refresh();
      root.add([
        button.container,
        this.scene.add.text(-width / 2 + 110, y - 4, info.label, { fontFamily: UI_TITLE_FONT, fontSize: '18px', color: UiTextColors.parchment }),
        this.scene.add.text(-width / 2 + 110, y + 18, info.about, {
          fontFamily: UI_FONT,
          fontSize: '13px',
          color: UiTextColors.dim,
          wordWrap: { width: width - 140 },
        }),
      ]);
    });
    const done = new UiButton(this.scene, width / 2 - 70, -height / 2 + 30, 100, 36, { onPress: () => this.close(), framed: true });
    done.add(this.scene.add.text(0, 0, 'Done', { fontFamily: UI_TITLE_FONT, fontSize: '18px', color: UiTextColors.parchment }).setOrigin(0.5));
    root.add(done.container);
    this.root = root;
  }
}
