import Phaser from 'phaser';
import {
  AI_DIFFICULTIES,
  AI_DIFFICULTY_NAMES,
  DEFAULT_AI_DIFFICULTY,
  isAiDifficultyName,
  type AiDifficultyName,
} from '@config/ai.config';
import { getAge } from '@config/ages.config';
import { BASE_X, GAME_HEIGHT, GAME_WIDTH, LANE_COLOR, LANE_Y, SCENE_KEYS } from '@config/constants';
import type { GameSceneData } from '@/scenes/GameScene';
import { addPanel, UI_FONT, UiColors, UiTextColors, UiTextures } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import { baseSpriteKey, textureKeyFor } from '@utils/PlaceholderArt';

/** Registry key that remembers the last difficulty picked this session. */
const REGISTRY_DIFFICULTY = 'menu-ai-difficulty';

const CARD_WIDTH = 300;
const CARD_HEIGHT = 120;
const CARD_GAP = 20;
const CARD_Y = 300;

/**
 * Title screen (Phase 13): pick the enemy's difficulty and start a match.
 * Keys: Left/Right or 1-3 choose, Enter or Space plays.
 */
export class MenuScene extends Phaser.Scene {
  private choice: AiDifficultyName = DEFAULT_AI_DIFFICULTY;
  private cards: Partial<Record<AiDifficultyName, UiButton>> = {};

  constructor() {
    super({ key: SCENE_KEYS.menu });
  }

  create(): void {
    const remembered: unknown = this.registry.get(REGISTRY_DIFFICULTY);
    this.choice = isAiDifficultyName(remembered) ? remembered : DEFAULT_AI_DIFFICULTY;
    this.cards = {};
    this.drawScenery();

    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, 104, 'AGE OF WAR', { fontFamily: UI_FONT, fontSize: '64px', color: UiTextColors.parchment, stroke: '#2a2233', strokeThickness: 8 })
      .setOrigin(0.5);
    this.add
      .text(cx, 158, 'clone  ·  five ages, one lane', { fontFamily: UI_FONT, fontSize: '18px', color: '#2a2233' })
      .setOrigin(0.5);
    this.add
      .text(cx, 222, 'Choose your opponent', { fontFamily: UI_FONT, fontSize: '20px', color: '#2a2233' })
      .setOrigin(0.5);

    const rowWidth = AI_DIFFICULTY_NAMES.length * CARD_WIDTH + (AI_DIFFICULTY_NAMES.length - 1) * CARD_GAP;
    AI_DIFFICULTY_NAMES.forEach((name, i) => {
      const preset = AI_DIFFICULTIES[name];
      const x = cx - rowWidth / 2 + CARD_WIDTH / 2 + i * (CARD_WIDTH + CARD_GAP);
      const card = new UiButton(this, x, CARD_Y, CARD_WIDTH, CARD_HEIGHT, {
        onPress: () => this.select(name),
        tint: UiColors.panelDark,
        hoverTint: UiColors.panelHover,
      });
      card.add(
        this.add
          .text(0, -30, `${i + 1}  ${preset.label}`, { fontFamily: UI_FONT, fontSize: '24px', color: UiTextColors.gold })
          .setOrigin(0.5),
        this.add
          .text(0, 16, preset.description, {
            fontFamily: UI_FONT,
            fontSize: '14px',
            color: UiTextColors.parchment,
            align: 'center',
            wordWrap: { width: CARD_WIDTH - 36 },
          })
          .setOrigin(0.5),
      );
      this.cards[name] = card;
    });

    const play = new UiButton(this, cx, 446, 240, 60, { onPress: () => this.play(), tint: UiColors.ready });
    play.add(this.add.text(0, 0, 'Play', { fontFamily: UI_FONT, fontSize: '28px', color: UiTextColors.parchment }).setOrigin(0.5));

    addPanel(this, UiTextures.panel, cx, 628, 820, 92, UiColors.panelDark).setAlpha(0.85);
    this.add
      .text(
        cx,
        628,
        [
          'Buy units 1-5  ·  Units/Turrets tab: Tab  ·  Special: S  ·  Age up: A',
          'Pause: P or Esc  ·  Destroy the enemy base, keep yours standing.',
          'Menu: Left/Right or 1-3 to choose, Enter to play',
        ],
        { fontFamily: UI_FONT, fontSize: '14px', color: UiTextColors.parchment, align: 'center', lineSpacing: 8 },
      )
      .setOrigin(0.5);

    const keys = this.input.keyboard;
    keys?.on('keydown-LEFT', () => this.step(-1));
    keys?.on('keydown-RIGHT', () => this.step(1));
    keys?.on('keydown-ONE', () => this.select('easy'));
    keys?.on('keydown-TWO', () => this.select('normal'));
    keys?.on('keydown-THREE', () => this.select('hard'));
    keys?.on('keydown-ENTER', () => this.play());
    keys?.on('keydown-SPACE', () => this.play());

    this.select(this.choice);
  }

  private drawScenery(): void {
    const { sky, ground } = getAge(0).visuals;
    this.cameras.main.setBackgroundColor(sky);
    const g = this.add.graphics();
    g.fillStyle(ground, 1);
    g.fillRect(0, LANE_Y, GAME_WIDTH, GAME_HEIGHT - LANE_Y);
    g.lineStyle(4, LANE_COLOR, 1);
    g.lineBetween(0, LANE_Y, GAME_WIDTH, LANE_Y);
    this.add.image(BASE_X.player, LANE_Y, textureKeyFor(baseSpriteKey(0), 'player')).setOrigin(0.5, 1);
    this.add.image(BASE_X.enemy, LANE_Y, textureKeyFor(baseSpriteKey(0), 'enemy')).setOrigin(0.5, 1).setFlipX(true);
  }

  private select(name: AiDifficultyName): void {
    this.choice = name;
    this.registry.set(REGISTRY_DIFFICULTY, name);
    for (const key of AI_DIFFICULTY_NAMES) this.cards[key]?.setSelected(key === name);
  }

  private step(direction: number): void {
    const i = AI_DIFFICULTY_NAMES.indexOf(this.choice);
    const next = AI_DIFFICULTY_NAMES[(i + direction + AI_DIFFICULTY_NAMES.length) % AI_DIFFICULTY_NAMES.length];
    if (next) this.select(next);
  }

  private play(): void {
    this.scene.start(SCENE_KEYS.game, { ai: this.choice } satisfies GameSceneData);
  }
}
