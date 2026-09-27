import Phaser from 'phaser';
import {
  AI_DIFFICULTIES,
  AI_DIFFICULTY_NAMES,
  DEFAULT_AI_DIFFICULTY,
  isAiDifficultyName,
  type AiDifficultyName,
} from '@config/ai.config';
import { AI_PROFILES, DEFAULT_AI_PROFILE, findAiProfile } from '@config/aiGenome.config';
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
import { bindingsLabel, keyHint } from '@ui/keymap';
import type { ControlsSceneData } from '@ui/ControlsScene';
import { ExperimentsPanel } from '@ui/experimental/ExperimentsPanel';
import { feature } from '@config/features.config';
import { baseArtKey, BASE_SUPERSAMPLE, ensureBaseArt } from '@utils/BaseArt';
import { ensureRigArt } from '@utils/RigArt';

/** Registry keys that remember the last difficulty and AI profile picked this session. */
const REGISTRY_DIFFICULTY = 'menu-ai-difficulty';
const REGISTRY_PROFILE = 'menu-ai-profile';

const CARD_WIDTH = 280;
const CARD_HEIGHT = 112;
const CARD_GAP = 18;
const CARD_Y = 300;

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
  private profileId = DEFAULT_AI_PROFILE;
  private profileText!: Phaser.GameObjects.Text;
  private profileAbout!: Phaser.GameObjects.Text;
  private cards: Partial<Record<AiDifficultyName, UiButton>> = {};
  private backdrop: Backdrop | null = null;
  private parade: Phaser.GameObjects.Sprite[] = [];
  private experiments: ExperimentsPanel | null = null;

  constructor() {
    super({ key: SCENE_KEYS.menu });
  }

  create(): void {
    applyUiTheme(0);
    const remembered: unknown = this.registry.get(REGISTRY_DIFFICULTY);
    this.choice = isAiDifficultyName(remembered) ? remembered : DEFAULT_AI_DIFFICULTY;
    const rememberedProfile: unknown = this.registry.get(REGISTRY_PROFILE);
    this.profileId = findAiProfile(typeof rememberedProfile === 'string' ? rememberedProfile : null)?.id ?? DEFAULT_AI_PROFILE;
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
      .text(cx, 218, 'Choose your opponent', {
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

    // Enemy AI profile (strategy), 2026-09-26: cycle with the arrows or Q / E.
    const profileY = 404;
    const left = new UiButton(this, cx - 250, profileY, 44, 44, { onPress: () => this.cycleProfile(-1), framed: true });
    left.add(this.add.text(0, 0, '<', { fontFamily: UI_TITLE_FONT, fontSize: '26px', color: UiTextColors.parchment }).setOrigin(0.5));
    const right = new UiButton(this, cx + 250, profileY, 44, 44, { onPress: () => this.cycleProfile(1), framed: true });
    right.add(this.add.text(0, 0, '>', { fontFamily: UI_TITLE_FONT, fontSize: '26px', color: UiTextColors.parchment }).setOrigin(0.5));
    addThemedPanel(this, cx, profileY, 440, 56, { alpha: 0.95 });
    this.profileText = this.add
      .text(cx, profileY - 10, '', { fontFamily: UI_TITLE_FONT, fontSize: '22px', color: UiTextColors.gold, stroke: UiTextColors.stroke, strokeThickness: 4 })
      .setOrigin(0.5);
    this.profileAbout = this.add
      .text(cx, profileY + 14, '', { fontFamily: UI_FONT, fontSize: '13px', color: UiTextColors.parchment })
      .setOrigin(0.5);
    this.showProfile();

    const play = new UiButton(this, cx, 486, 250, 64, { onPress: () => this.play(), tint: UiColors.ready, framed: true });
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
          `Slot keys ${keyHint('slot-1')}-${keyHint('slot-5')} act on the open tab  ·  Tabs ${(['tab-units', 'tab-turrets', 'tab-buildings', 'tab-research'] as const).map((id) => keyHint(id)).join(' ')}  ·  Armies ${keyHint('army-1')}-${keyHint('army-8')}  ·  Special ${keyHint('special')}  ·  Age up ${keyHint('age-up')}  ·  Pause ${bindingsLabel('pause')}`,
          `Destroy the enemy base, keep yours standing.  Menu: 1-3 difficulty, Q/E AI profile, Enter to play${feature('conquest') ? ', C Conquest' : ''}, K Controls`,
        ],
        { fontFamily: UI_FONT, fontSize: '15px', color: UiTextColors.parchment, align: 'center', lineSpacing: 8 },
      )
      .setOrigin(0.5);

    // Prototype switches (2026-09-26).
    this.experiments = new ExperimentsPanel(this);
    const labs = new UiButton(this, GAME_WIDTH - 100, 40, 170, 44, { onPress: () => this.experiments?.toggle(), framed: true });
    labs.add(this.add.text(0, 0, 'Experiments', { fontFamily: UI_TITLE_FONT, fontSize: '19px', color: UiTextColors.parchment }).setOrigin(0.5));
    // Key bindings and unit compositions (2026-09-27); the menu pauses while they're open.
    const controls = new UiButton(this, GAME_WIDTH - 280, 40, 170, 44, { onPress: () => this.openControls(), framed: true });
    controls.add(this.add.text(0, 0, 'Controls', { fontFamily: UI_TITLE_FONT, fontSize: '19px', color: UiTextColors.parchment }).setOrigin(0.5));
    this.input.keyboard?.on('keydown-K', () => this.openControls());
    // Conquest campaign (prototype, feature `conquest`).
    if (feature('conquest')) {
      const conquest = new UiButton(this, cx + 300, 486, 200, 56, { onPress: () => this.openConquest(), tint: UiColors.panelDark, framed: true });
      conquest.add(
        this.add
          .text(0, -6, 'CONQUEST', { fontFamily: UI_TITLE_FONT, fontSize: '26px', color: UiTextColors.gold, stroke: UiTextColors.stroke, strokeThickness: 5 })
          .setOrigin(0.5),
        this.add.text(0, 17, 'roguelite campaign', { fontFamily: UI_FONT, fontSize: '12px', fontStyle: '600', color: UiTextColors.parchment }).setOrigin(0.5),
      );
      this.input.keyboard?.on('keydown-C', () => this.openConquest());
    }

    const keys = this.input.keyboard;
    keys?.on('keydown-LEFT', () => this.step(-1));
    keys?.on('keydown-RIGHT', () => this.step(1));
    keys?.on('keydown-ONE', () => this.select('easy'));
    keys?.on('keydown-TWO', () => this.select('normal'));
    keys?.on('keydown-THREE', () => this.select('hard'));
    keys?.on('keydown-Q', () => this.cycleProfile(-1));
    keys?.on('keydown-E', () => this.cycleProfile(1));
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

  private cycleProfile(direction: number): void {
    const i = AI_PROFILES.findIndex((p) => p.id === this.profileId);
    const next = AI_PROFILES[(i + direction + AI_PROFILES.length) % AI_PROFILES.length];
    if (!next) return;
    this.profileId = next.id;
    this.registry.set(REGISTRY_PROFILE, next.id);
    this.showProfile();
  }

  private showProfile(): void {
    const profile = findAiProfile(this.profileId);
    this.profileText.setText(`Enemy AI: ${profile?.label ?? 'Classic'}`);
    this.profileAbout.setText(profile?.description ?? '');
  }

  private openControls(): void {
    if (this.scene.isActive(SCENE_KEYS.controls)) return;
    this.scene.launch(SCENE_KEYS.controls, { from: SCENE_KEYS.menu } satisfies ControlsSceneData);
    this.scene.pause();
  }

  private openConquest(): void {
    if (this.experiments?.isOpen) return;
    this.scene.start(SCENE_KEYS.conquest);
  }

  private play(): void {
    if (this.experiments?.isOpen) return;
    this.scene.start(SCENE_KEYS.game, { ai: this.choice, profile: this.profileId } satisfies GameSceneData);
  }
}
