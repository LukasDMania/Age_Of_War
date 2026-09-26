import Phaser from 'phaser';
import {
  AI_DIFFICULTIES,
  AI_DIFFICULTY_NAMES,
  DEFAULT_AI_DIFFICULTY,
  isAiDifficultyName,
  type AiDifficultyName,
} from '@config/ai.config';
import { BACKGROUNDS } from '@config/backgrounds.config';
import { BASE_X, GAME_WIDTH, LANE_Y, SCENE_KEYS } from '@config/constants';
import { unitArtKey } from '@config/unitArt.config';
import type { GameSceneData } from '@/scenes/GameScene';
import { Backdrop } from '@entities/Backdrop';
import { unitArtFor } from '@entities/unitArt';
import {
  addThemedPanel,
  applyUiTheme,
  UI_FONT,
  UI_TITLE_FONT,
  UiColors,
  UiTextColors,
} from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import { baseArtKey, BASE_SUPERSAMPLE, ensureBaseArt } from '@utils/BaseArt';
import { ensureRigArt } from '@utils/RigArt';

/** Registry key that remembers the last difficulty picked this session. */
const REGISTRY_DIFFICULTY = 'menu-ai-difficulty';

const CARD_WIDTH = 280;
const CARD_HEIGHT = 112;
const CARD_GAP = 18;
const CARD_Y = 316;

/** The title screen parade: one unit per age, walking the lane in order. */
const PARADE: readonly string[] = [
  'stone-mammoth-rider',
  'stone-clubber',
  'castle-knight',
  'castle-archer',
  'renaissance-musketeer',
  'renaissance-pikeman',
  'modern-tank',
  'modern-rifleman',
  'future-mech',
  'future-blade-trooper',
];
const PARADE_SPEED = 38;
const PARADE_GAP = 120;

/**
 * Title screen (Phase 13; restyled 2026-09-26): pick the enemy's difficulty
 * and start a match. A parade of units from all five ages walks the lane in
 * front of the forest backdrop. Keys: Left/Right or 1-3 choose, Enter or
 * Space plays.
 */
export class MenuScene extends Phaser.Scene {
  private choice: AiDifficultyName = DEFAULT_AI_DIFFICULTY;
  private cards: Partial<Record<AiDifficultyName, UiButton>> = {};
  private backdrop: Backdrop | null = null;
  private parade: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    super({ key: SCENE_KEYS.menu });
  }

  create(): void {
    applyUiTheme(0);
    const remembered: unknown = this.registry.get(REGISTRY_DIFFICULTY);
    this.choice = isAiDifficultyName(remembered) ? remembered : DEFAULT_AI_DIFFICULTY;
    this.cards = {};
    this.drawScenery();

    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, 96, 'AGE OF WAR', {
        fontFamily: UI_TITLE_FONT,
        fontSize: '92px',
        color: '#f7cf5a',
        stroke: '#241408',
        strokeThickness: 12,
      })
      .setOrigin(0.5)
      .setShadow(0, 6, 'rgba(0,0,0,0.45)', 6, true, true);
    this.add
      .text(cx, 164, 'Five ages  ·  one lane  ·  hold the line', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        fontStyle: '600',
        color: '#fff6de',
        stroke: '#241408',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 234, 'Choose your opponent', {
        fontFamily: UI_TITLE_FONT,
        fontSize: '26px',
        color: '#fff6de',
        stroke: '#241408',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    const rowWidth = AI_DIFFICULTY_NAMES.length * CARD_WIDTH + (AI_DIFFICULTY_NAMES.length - 1) * CARD_GAP;
    AI_DIFFICULTY_NAMES.forEach((name, i) => {
      const preset = AI_DIFFICULTIES[name];
      const x = cx - rowWidth / 2 + CARD_WIDTH / 2 + i * (CARD_WIDTH + CARD_GAP);
      const card = new UiButton(this, x, CARD_Y, CARD_WIDTH, CARD_HEIGHT, {
        onPress: () => this.select(name),
        tint: UiColors.panelDark,
        hoverTint: UiColors.panelHover,
        framed: true,
      });
      card.add(
        this.add
          .text(0, -28, `${i + 1}  ${preset.label}`, {
            fontFamily: UI_TITLE_FONT,
            fontSize: '28px',
            color: UiTextColors.gold,
            stroke: UiTextColors.stroke,
            strokeThickness: 5,
          })
          .setOrigin(0.5),
        this.add
          .text(0, 18, preset.description, {
            fontFamily: UI_FONT,
            fontSize: '15px',
            color: UiTextColors.parchment,
            align: 'center',
            wordWrap: { width: CARD_WIDTH - 36 },
          })
          .setOrigin(0.5),
      );
      this.cards[name] = card;
    });

    const play = new UiButton(this, cx, 438, 250, 64, { onPress: () => this.play(), tint: UiColors.ready, framed: true });
    play.add(
      this.add
        .text(0, 0, 'PLAY', {
          fontFamily: UI_TITLE_FONT,
          fontSize: '38px',
          color: '#fff6de',
          stroke: UiTextColors.stroke,
          strokeThickness: 6,
        })
        .setOrigin(0.5),
    );
    this.tweens.add({ targets: play.container, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    addThemedPanel(this, cx, 650, 840, 84, { alpha: 0.9 });
    this.add
      .text(
        cx,
        650,
        [
          'Buy units 1-5  ·  Tab switches panels  ·  Special: S  ·  Age up: A  ·  Pause: P or Esc',
          'Destroy the enemy base, keep yours standing.  Menu: Left/Right or 1-3, Enter to play',
        ],
        { fontFamily: UI_FONT, fontSize: '15px', color: UiTextColors.parchment, align: 'center', lineSpacing: 8 },
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.backdrop?.destroy(true);
      this.backdrop = null;
      this.parade = [];
    });
  }

  update(time: number, delta: number): void {
    this.backdrop?.update(time * 0.02, time);
    for (const unit of this.parade) {
      unit.x += (PARADE_SPEED * delta) / 1000;
      if (unit.x > GAME_WIDTH + 80) unit.x -= PARADE.length * PARADE_GAP;
    }
  }

  private drawScenery(): void {
    this.cameras.main.setBackgroundColor(0x87ceeb);
    const forest = BACKGROUNDS.find((b) => b.id === 'forest-path-bright') ?? BACKGROUNDS[0]!;
    this.backdrop = new Backdrop(this);
    this.backdrop.show(forest);
    for (const side of ['player', 'enemy'] as const) {
      ensureBaseArt(this, 0, side);
      this.add
        .image(BASE_X[side], LANE_Y, baseArtKey(0, side))
        .setOrigin(0.5, 1)
        .setScale(1 / BASE_SUPERSAMPLE)
        .setFlipX(side === 'enemy');
    }
    // A parade of the ages walking out of the player's base.
    this.parade = PARADE.map((unitId, i) => {
      ensureRigArt(this, unitId);
      const art = unitArtFor(unitId);
      const key = unitArtKey(unitId, 'walk', 'player');
      const sprite = this.add
        .sprite(GAME_WIDTH - i * PARADE_GAP, LANE_Y, key, art?.standFrame ?? 0)
        .setOrigin(art?.originX ?? 0.5, art?.footY ?? 1)
        .setScale(art?.scale ?? 1);
      if (this.anims.exists(key)) sprite.play({ key, startFrame: i % 8 });
      return sprite;
    });
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
