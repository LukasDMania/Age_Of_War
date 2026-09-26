import Phaser from 'phaser';
import { AI_DIFFICULTIES, type AiDifficultyName } from '@config/ai.config';
import { getAge } from '@config/ages.config';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '@config/constants';
import type { SideStats } from '@systems/StatsSystem';
import { addThemedPanel, UI_FONT, UI_TITLE_FONT, UiTextColors } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import { emit, Events } from '@utils/EventBus';

/** What the game-over panel reports. */
export interface MatchSummary {
  won: boolean;
  durationMs: number;
  playerAge: number;
  enemyAge: number;
  enemyController: AiDifficultyName | 'off';
  player: SideStats;
}

export type OverlaySceneData = { kind: 'paused' } | { kind: 'gameover'; summary: MatchSummary };

const PANEL_WIDTH = 520;
const BUTTON_WIDTH = 150;
const BUTTON_HEIGHT = 46;

/**
 * The pause and game-over panel (Phase 13), launched by GameScene on top of
 * the HUD. It dims the match, blocks clicks to the HUD below, and only sends
 * requests: `resume-requested`, `restart-requested`, `quit-to-menu-requested`.
 *
 * Keys: R restarts, M goes to the menu, Enter resumes (paused) or plays again
 * (game over). P and Esc are handled by GameScene.
 */
export class OverlayScene extends Phaser.Scene {
  private view!: OverlaySceneData;

  constructor() {
    super({ key: SCENE_KEYS.overlay });
  }

  init(data: OverlaySceneData): void {
    this.view = data;
  }

  create(): void {
    const data = this.view;
    // Dim the match; interactive so clicks don't reach the HUD underneath.
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, data.kind === 'paused' ? 0.45 : 0.55)
      .setOrigin(0)
      .setInteractive();

    const panel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
    const lines = data.kind === 'gameover' ? summaryLines(data.summary) : ['The match is on hold.', 'P or Esc to resume.'];
    const height = 150 + lines.length * 26 + BUTTON_HEIGHT;
    panel.add(addThemedPanel(this, 0, 0, PANEL_WIDTH, height, { alpha: 0.97 }));

    const top = -height / 2;
    const title = data.kind === 'paused' ? 'PAUSED' : data.summary.won ? 'VICTORY' : 'DEFEAT';
    const titleColor = data.kind === 'paused' ? UiTextColors.parchment : data.summary.won ? '#8fe08f' : '#f08a80';
    panel.add(
      this.add
        .text(0, top + 50, title, {
          fontFamily: UI_TITLE_FONT,
          fontSize: '58px',
          color: titleColor,
          stroke: UiTextColors.stroke,
          strokeThickness: 8,
        })
        .setOrigin(0.5)
        .setShadow(0, 5, 'rgba(0,0,0,0.45)', 5, true, true),
    );
    lines.forEach((line, i) => {
      panel.add(
        this.add
          .text(0, top + 108 + i * 26, line, { fontFamily: UI_FONT, fontSize: '17px', color: UiTextColors.parchment })
          .setOrigin(0.5),
      );
    });

    const buttons: { label: string; onPress: () => void }[] =
      data.kind === 'paused'
        ? [
            { label: 'Resume', onPress: () => emit(Events.ResumeRequested, {}) },
            { label: 'Restart', onPress: () => emit(Events.RestartRequested, {}) },
            { label: 'Main menu', onPress: () => emit(Events.QuitToMenuRequested, {}) },
          ]
        : [
            { label: 'Play again', onPress: () => emit(Events.RestartRequested, {}) },
            { label: 'Main menu', onPress: () => emit(Events.QuitToMenuRequested, {}) },
          ];
    const gap = 16;
    const rowWidth = buttons.length * BUTTON_WIDTH + (buttons.length - 1) * gap;
    const buttonY = height / 2 - 20 - BUTTON_HEIGHT / 2;
    buttons.forEach((spec, i) => {
      const x = -rowWidth / 2 + BUTTON_WIDTH / 2 + i * (BUTTON_WIDTH + gap);
      const button = new UiButton(this, x, buttonY, BUTTON_WIDTH, BUTTON_HEIGHT, { onPress: spec.onPress, framed: true });
      button.add(
        this.add
          .text(0, 0, spec.label, { fontFamily: UI_TITLE_FONT, fontSize: '20px', color: UiTextColors.parchment, stroke: UiTextColors.stroke, strokeThickness: 4 })
          .setOrigin(0.5),
      );
      panel.add(button.container);
    });

    this.input.keyboard?.on('keydown-R', () => emit(Events.RestartRequested, {}));
    this.input.keyboard?.on('keydown-M', () => emit(Events.QuitToMenuRequested, {}));
    this.input.keyboard?.on('keydown-ENTER', () =>
      emit(data.kind === 'paused' ? Events.ResumeRequested : Events.RestartRequested, {}),
    );

    panel.setAlpha(0).setScale(0.92);
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 180, ease: 'Quad.easeOut' });
  }
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function summaryLines(s: MatchSummary): string[] {
  const enemy = s.enemyController === 'off' ? 'no AI' : `${AI_DIFFICULTIES[s.enemyController].label} AI`;
  return [
    `Match time ${formatTime(s.durationMs)}  ·  vs ${enemy}`,
    `You: ${getAge(s.playerAge).name} Age  ·  Enemy: ${getAge(s.enemyAge).name} Age`,
    `Units trained ${s.player.unitsTrained}  ·  Kills ${s.player.kills}  ·  Lost ${s.player.losses}`,
    `Gold earned ${Math.round(s.player.goldEarned)}  ·  Turrets built ${s.player.turretsBuilt}`,
  ];
}
