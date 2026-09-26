import Phaser from 'phaser';
import { AGE_NAMES, getAge } from '@config/ages.config';
import { AI_DIFFICULTIES } from '@config/ai.config';
import { findAiProfile } from '@config/aiGenome.config';
import { BACKGROUNDS } from '@config/backgrounds.config';
import { ASCENSION, GLORY_UNLOCKS, MUTATORS, RELICS, RUN_STAGES } from '@config/conquest.config';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '@config/constants';
import { unitArtKey } from '@config/unitArt.config';
import { unitArtFor } from '@entities/unitArt';
import { ensureRigArt } from '@utils/RigArt';
import type { GameSceneData } from '@/scenes/GameScene';
import { Backdrop } from '@entities/Backdrop';
import {
  abandonRun,
  battleEffects,
  buyUnlock,
  chooseNode,
  finishBattle,
  hasUnlock,
  loadMeta,
  loadRun,
  pickRelic,
  rerollRelics,
  startRun,
  type ConquestNode,
  type ConquestRun,
} from '@state/conquestState';
import { addThemedPanel, applyUiTheme, UI_FONT, UI_TITLE_FONT, UiColors, UiTextColors } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';

const CX = GAME_WIDTH / 2;
const TRACK_Y = 138;
const TRACK_GAP = 170;
const DIFFICULTY_COLORS = { easy: '#8fe08f', normal: '#f2c744', hard: '#f08a80' } as const;

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;
const body = (size: number, color: string = UiTextColors.parchment, extra: TextStyle = {}): TextStyle => ({
  fontFamily: UI_FONT,
  fontSize: `${size}px`,
  fontStyle: '600',
  color,
  ...extra,
});
const title = (size: number, color: string = UiTextColors.gold): TextStyle => ({
  fontFamily: UI_TITLE_FONT,
  fontSize: `${size}px`,
  color,
  stroke: UiTextColors.stroke,
  strokeThickness: Math.max(3, Math.round(size / 7)),
});

/** A small emblem per relic, so the relic bar reads at a glance. */
const RELIC_COLORS: Record<string, number> = {
  whetstone: 0xc9ced6,
  hides: 0xa0703c,
  'war-chest': 0xe0b85c,
  prospector: 0x6fb0e0,
  tomes: 0x9b7fe0,
  anvil: 0x7d7d8a,
  watchtower: 0xb58a5a,
  drums: 0xd0584a,
  longbows: 0x6fcf6f,
  plate: 0xa8b8c8,
  crown: 0xf2d35a,
  grail: 0xf4f0e0,
};

/**
 * Conquest mode's campaign screen (prototype, feature `conquest`): start a
 * run (and pick its ascension), choose the next battle from the stage's
 * nodes, take a relic after a win, read the run's end, and spend Glory in
 * the Hall of Glory. Battles are ordinary GameScene matches started with
 * `GameSceneData.conquest`; GameScene reports the result back to
 * `state/conquestState.ts` and returns here.
 *
 * Keys: 1-4 pick a node or relic, Enter starts a run, Esc goes back.
 */
export class ConquestScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;
  private content: Phaser.GameObjects.Container | null = null;
  private hall: Phaser.GameObjects.Container | null = null;
  private gloryText!: Phaser.GameObjects.Text;
  private ascension = 0;
  private hotkeys: (() => void)[] = [];

  constructor() {
    super({ key: SCENE_KEYS.conquest });
  }

  create(): void {
    applyUiTheme(0);
    this.cameras.main.setBackgroundColor(0x2b3346);
    this.backdrop = new Backdrop(this);
    this.backdrop.show(BACKGROUNDS.find((b) => b.id === 'cloudy-peaks') ?? BACKGROUNDS[0]!);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x10121c, 0.35).setOrigin(0).setDepth(-5);
    this.ascension = loadMeta().ascensionUnlocked;

    this.add.text(CX, 52, 'CONQUEST', title(58, '#f7cf5a')).setOrigin(0.5).setShadow(0, 5, 'rgba(0,0,0,0.45)', 5, true, true);
    const back = new UiButton(this, 90, 40, 140, 42, { onPress: () => this.toMenu(), framed: true });
    back.add(this.add.text(0, 0, '< Menu', title(19, UiTextColors.parchment)).setOrigin(0.5));
    const hall = new UiButton(this, GAME_WIDTH - 110, 40, 190, 42, { onPress: () => this.toggleHall(), framed: true, tint: UiColors.ready });
    hall.add(this.add.text(0, 0, 'Hall of Glory', title(19, UiTextColors.parchment)).setOrigin(0.5));
    this.gloryText = this.add.text(GAME_WIDTH - 110, 80, '', body(16, UiTextColors.gold)).setOrigin(0.5);

    const keys = this.input.keyboard;
    (['ONE', 'TWO', 'THREE', 'FOUR'] as const).forEach((key, i) => keys?.on(`keydown-${key}`, () => this.hotkeys[i]?.()));
    keys?.on('keydown-ESC', () => (this.hall ? this.toggleHall() : this.toMenu()));
    keys?.on('keydown-ENTER', () => {
      if (!this.hall && !loadRun()) this.begin();
    });

    this.refresh();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.backdrop?.destroy(true);
      this.backdrop = null;
      this.content = null;
      this.hall = null;
    });
  }

  update(time: number): void {
    this.backdrop?.update(time * 0.015, time);
  }

  /** Redraws everything below the title for the run's current status. */
  private refresh(): void {
    this.content?.destroy();
    this.content = this.add.container(0, 0);
    this.hotkeys = [];
    const meta = loadMeta();
    this.gloryText.setText(`Glory ${meta.glory}`);
    const run = loadRun();
    this.drawTrack(run);
    if (!run) this.showStart();
    else if (run.status === 'choosing') this.showNodes(run);
    else if (run.status === 'reward') this.showRelicChoice(run);
    else if (run.status === 'battle') this.showInterrupted(run);
    else this.showEnd(run);
    if (run) this.drawRelicBar(run);
  }

  private add2<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.content?.add(object);
    return object;
  }

  private button(x: number, y: number, w: number, h: number, label: string, onPress: () => void, tint?: number): UiButton {
    const b = new UiButton(this, x, y, w, h, { onPress, framed: true, ...(tint !== undefined ? { tint } : {}) });
    b.add(this.add.text(0, 0, label, title(Math.min(24, h * 0.45), UiTextColors.parchment)).setOrigin(0.5));
    this.add2(b.container);
    return b;
  }

  /** Five medallions: cleared, current, ahead. */
  private drawTrack(run: ConquestRun | null): void {
    const g = this.add2(this.add.graphics());
    const n = RUN_STAGES.length;
    const x0 = CX - ((n - 1) * TRACK_GAP) / 2;
    g.lineStyle(6, 0x1c1826, 0.9).lineBetween(x0, TRACK_Y, x0 + (n - 1) * TRACK_GAP, TRACK_Y);
    RUN_STAGES.forEach((stage, i) => {
      const x = x0 + i * TRACK_GAP;
      const cleared = run !== null && (i < run.stage || (i === run.stage && run.status === 'won') || (i === run.stage && run.status === 'reward'));
      const current = run !== null && i === run.stage && (run.status === 'choosing' || run.status === 'battle');
      const lostHere = run?.status === 'lost' && i === run.stage;
      if (i > 0 && run && i <= run.stage) g.lineStyle(6, UiColors.gold, 1).lineBetween(x - TRACK_GAP, TRACK_Y, x, TRACK_Y);
      g.fillStyle(0x1c1826, 1).fillCircle(x, TRACK_Y, 22);
      g.fillStyle(cleared ? UiColors.gold : lostHere ? UiColors.bad : current ? 0x584a6e : 0x2a2233, 1).fillCircle(x, TRACK_Y, 18);
      g.lineStyle(3, current ? 0xfff6de : UiColors.trim, current ? 1 : 0.7).strokeCircle(x, TRACK_Y, 20);
      const mark = cleared ? '✓' : lostHere ? '✗' : String(i + 1);
      this.add2(this.add.text(x, TRACK_Y, mark, title(20, cleared ? '#2a2233' : UiTextColors.parchment)).setOrigin(0.5));
      this.add2(
        this.add
          .text(x, TRACK_Y + 36, stage.name, title(16, current ? UiTextColors.title : UiTextColors.parchment))
          .setOrigin(0.5),
      );
      if (current) {
        const ring = this.add2(this.add.circle(x, TRACK_Y, 26).setStrokeStyle(3, 0xfff6de, 0.9));
        this.tweens.add({ targets: ring, scale: 1.25, alpha: 0, duration: 1100, repeat: -1 });
      }
    });
  }

  private showStart(): void {
    const meta = loadMeta();
    this.add2(addThemedPanel(this, CX, 390, 760, 330, { alpha: 0.96 }));
    this.add2(this.add.text(CX, 262, 'A campaign of five battles', title(30)).setOrigin(0.5));
    const lines = [
      'Before each battle, choose where to fight: every enemy has its own AI,',
      'difficulty and battlefield rules. Win to take a relic for the rest of the run.',
      'Lose once and the campaign is over. Every victory earns Glory to spend',
      'in the Hall of Glory; clearing a campaign unlocks the next Ascension.',
    ];
    this.add2(this.add.text(CX, 336, lines, body(16, UiTextColors.parchment, { align: 'center', lineSpacing: 6 })).setOrigin(0.5));
    if (meta.ascensionUnlocked > 0) {
      const y = 430;
      const label = this.add2(this.add.text(CX, y, '', title(22)).setOrigin(0.5));
      const about = this.add2(this.add.text(CX, y + 24, '', body(13, UiTextColors.dim)).setOrigin(0.5));
      const show = (): void => {
        label.setText(this.ascension === 0 ? 'Ascension 0 (normal)' : `Ascension ${this.ascension}`);
        const a = this.ascension;
        about.setText(
          a === 0
            ? 'No extra rules'
            : `Enemies +${Math.round(ASCENSION.hpPerLevel * a * 100)}% HP, +${Math.round(ASCENSION.damagePerLevel * a * 100)}% damage, +${Math.round(ASCENSION.incomePerLevel * a * 100)}% income; +${a} Glory a win`,
        );
      };
      const step = (d: number): void => {
        this.ascension = Phaser.Math.Clamp(this.ascension + d, 0, meta.ascensionUnlocked);
        show();
      };
      this.button(CX - 230, y + 8, 44, 44, '<', () => step(-1));
      this.button(CX + 230, y + 8, 44, 44, '>', () => step(1));
      show();
    }
    const march = this.button(CX, 505, 260, 60, 'MARCH!', () => this.begin(), UiColors.ready);
    this.tweens.add({ targets: march.container, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const record = meta.runsPlayed > 0 ? `Campaigns won ${meta.runsWon} of ${meta.runsPlayed}` : 'Your first campaign awaits';
    this.add2(this.add.text(CX, 600, record, body(15, UiTextColors.dim)).setOrigin(0.5));
  }

  private begin(): void {
    startRun(this.ascension);
    this.refresh();
  }

  private showNodes(run: ConquestRun): void {
    const stage = RUN_STAGES[run.stage]!;
    this.add2(
      this.add
        .text(CX, 200, `${stage.name} ${run.stage + 1} of ${RUN_STAGES.length}: choose your battle`, title(26, UiTextColors.title))
        .setOrigin(0.5),
    );
    const width = 330;
    const height = 370;
    const gap = 26;
    const count = run.nodes.length;
    const x0 = CX - ((count - 1) * (width + gap)) / 2;
    run.nodes.forEach((node, i) => {
      const x = x0 + i * (width + gap);
      this.nodeCard(x, 420, width, height, node, i, () => this.fight(run, i));
      this.hotkeys[i] = () => this.fight(run, i);
    });
    const abandon = new UiButton(this, 90, GAME_HEIGHT - 36, 140, 36, { onPress: () => this.confirmAbandon(), tint: 0x4a2a2a });
    abandon.add(this.add.text(0, 0, 'Abandon run', body(14)).setOrigin(0.5));
    this.add2(abandon.container);
  }

  private nodeCard(x: number, y: number, w: number, h: number, node: ConquestNode, index: number, onPress: () => void): void {
    const card = new UiButton(this, x, y, w, h, { onPress, framed: true, tint: UiColors.panelDark, hoverTint: UiColors.panelMid });
    const top = -h / 2;
    const difficulty = AI_DIFFICULTIES[node.difficulty];
    const profile = findAiProfile(node.profile);
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.text(-w / 2 + 16, top + 14, `${index + 1}`, title(22, UiTextColors.dim)),
      this.add.text(0, top + 28, difficulty.label, title(28, DIFFICULTY_COLORS[node.difficulty])).setOrigin(0.5),
      this.add.text(0, top + 60, `Enemy AI: ${profile?.label ?? node.profile}`, body(16, UiTextColors.title)).setOrigin(0.5),
      this.add
        .text(0, top + 82, profile?.description ?? '', body(12, UiTextColors.dim, { align: 'center', wordWrap: { width: w - 40 } }))
        .setOrigin(0.5, 0),
    ];
    let lineY = top + 134;
    const divider = this.add.graphics();
    divider.lineStyle(2, UiColors.trim, 0.35).lineBetween(-w / 2 + 24, lineY - 10, w / 2 - 24, lineY - 10);
    items.push(divider);
    if (node.startAge > 0) {
      items.push(this.add.text(-w / 2 + 22, lineY, `Starts in the ${AGE_NAMES[node.startAge]} Age`, body(15, '#9fd0ff')));
      lineY += 22;
      items.push(this.add.text(-w / 2 + 22, lineY, 'Both sides get extra starting gold', body(12, UiTextColors.dim)));
      lineY += 26;
    }
    if (node.mutators.length === 0) {
      items.push(this.add.text(-w / 2 + 22, lineY, 'No battlefield rules', body(15, UiTextColors.dim)));
    }
    for (const id of node.mutators) {
      const m = MUTATORS.find((mm) => mm.id === id);
      if (!m) continue;
      items.push(this.add.text(-w / 2 + 22, lineY, m.name, body(15, UiTextColors.gold)));
      items.push(this.add.text(-w / 2 + 22, lineY + 20, m.about, body(12, UiTextColors.parchment, { wordWrap: { width: w - 44 } })));
      lineY += 50;
    }
    // The enemy's front line (melee, ranged, heavy of its starting age), when there is room.
    const groundY = h / 2 - 80;
    const room = (groundY - lineY - 6) / 80;
    if (room >= 0.45) {
      const ground = this.add.graphics();
      ground.fillStyle(0x000000, 0.25).fillEllipse(0, groundY, w - 60, 14);
      items.push(ground);
      getAge(node.startAge).unitIds.slice(0, 3).forEach((unitId, i) => {
        const art = unitArtFor(unitId);
        if (!art) return;
        ensureRigArt(this, unitId);
        const scale = (art.scale ?? 1) * Math.min(0.85, room);
        const unit = this.add
          .sprite([-72, -10, 62][i] ?? 0, groundY, unitArtKey(unitId, 'walk', 'enemy'), art.standFrame ?? 0)
          .setOrigin(art.originX ?? 0.5, art.footY ?? 1)
          .setScale(scale)
          .setFlipX(true);
        items.push(unit);
      });
    }
    items.push(this.add.text(0, h / 2 - 56, `+${node.glory} Glory`, title(22, '#f7cf5a')).setOrigin(0.5));
    const fight = this.add.text(0, h / 2 - 24, 'FIGHT', title(20, UiTextColors.parchment)).setOrigin(0.5);
    items.push(fight);
    card.add(...items);
    this.add2(card.container);
  }

  private fight(run: ConquestRun, index: number): void {
    const node = chooseNode(index);
    if (!node) return;
    this.startBattle(run, node);
  }

  private startBattle(run: ConquestRun, node: ConquestNode): void {
    const profile = findAiProfile(node.profile);
    this.scene.start(SCENE_KEYS.game, {
      ai: node.difficulty,
      profile: node.profile,
      conquest: {
        effects: battleEffects(run, node),
        label: `${profile?.label ?? node.profile} · Conquest ${run.stage + 1}/${RUN_STAGES.length}`,
      },
    } satisfies GameSceneData);
  }

  private showRelicChoice(run: ConquestRun): void {
    const stage = RUN_STAGES[run.stage];
    this.add2(this.add.text(CX, 208, 'VICTORY!', title(44, '#8fe08f')).setOrigin(0.5));
    this.add2(
      this.add
        .text(CX, 250, `${stage?.name ?? 'Battle'} won · Glory this run ${run.glory} · choose a relic`, body(17, UiTextColors.title))
        .setOrigin(0.5),
    );
    const width = 250;
    const height = 220;
    const gap = 22;
    const count = run.offer.length;
    const x0 = CX - ((count - 1) * (width + gap)) / 2;
    run.offer.forEach((id, i) => {
      const relic = RELICS.find((r) => r.id === id);
      if (!relic) return;
      const take = (): void => {
        pickRelic(id);
        this.refresh();
      };
      this.hotkeys[i] = take;
      const card = new UiButton(this, x0 + i * (width + gap), 420, width, height, { onPress: take, framed: true, tint: UiColors.panelDark, hoverTint: UiColors.panelMid });
      const emblem = this.add.graphics();
      this.drawEmblem(emblem, 0, -58, 26, RELIC_COLORS[id] ?? UiColors.gold);
      card.add(
        emblem,
        this.add.text(-width / 2 + 14, -height / 2 + 10, `${i + 1}`, title(20, UiTextColors.dim)),
        this.add.text(0, 0, relic.name, title(24)).setOrigin(0.5),
        this.add
          .text(0, 26, relic.about, body(14, UiTextColors.parchment, { align: 'center', wordWrap: { width: width - 30 } }))
          .setOrigin(0.5, 0),
      );
      this.add2(card.container);
    });
    if (count === 0) this.add2(this.add.text(CX, 420, 'No relics left to find!', title(26, UiTextColors.dim)).setOrigin(0.5));
    this.button(CX + (hasUnlock('reroll') && !run.rerollUsed ? 110 : 0), 590, 200, 46, count === 0 ? 'Onward' : 'Skip', () => {
      pickRelic(null);
      this.refresh();
    });
    if (hasUnlock('reroll') && !run.rerollUsed) {
      this.button(CX - 110, 590, 200, 46, 'Reroll', () => {
        if (rerollRelics()) this.refresh();
      });
    }
  }

  private showInterrupted(run: ConquestRun): void {
    this.add2(addThemedPanel(this, CX, 380, 620, 230, { alpha: 0.96 }));
    this.add2(this.add.text(CX, 310, 'The battle was interrupted', title(30)).setOrigin(0.5));
    this.add2(this.add.text(CX, 356, 'Fight it again from the start, or retreat (the run ends).', body(16)).setOrigin(0.5));
    this.button(CX - 120, 430, 200, 50, 'Fight again', () => {
      if (run.current) this.startBattle(run, run.current);
    }, UiColors.ready);
    this.button(CX + 120, 430, 200, 50, 'Retreat', () => {
      finishBattle(false);
      this.refresh();
    });
  }

  private showEnd(run: ConquestRun): void {
    const won = run.status === 'won';
    const meta = loadMeta();
    this.add2(addThemedPanel(this, CX, 400, 680, 330, { alpha: 0.96 }));
    this.add2(this.add.text(CX, 282, won ? 'CONQUEST COMPLETE' : 'THE CAMPAIGN ENDS', title(40, won ? '#8fe08f' : '#f08a80')).setOrigin(0.5));
    const lines = [
      `Battles won ${run.wins} of ${RUN_STAGES.length}${run.ascension > 0 ? `  ·  Ascension ${run.ascension}` : ''}`,
      `Glory earned ${run.glory}  ·  Glory to spend ${meta.glory}`,
      won
        ? run.ascension + 1 <= ASCENSION.maxLevel
          ? `Ascension ${Math.min(ASCENSION.maxLevel, run.ascension + 1)} unlocked: tougher enemies, more Glory.`
          : 'You conquered the highest Ascension.'
        : 'Spend your Glory in the Hall of Glory and march again.',
    ];
    this.add2(this.add.text(CX, 368, lines, body(17, UiTextColors.parchment, { align: 'center', lineSpacing: 8 })).setOrigin(0.5));
    this.button(CX - 120, 492, 210, 52, 'New campaign', () => {
      abandonRun();
      this.ascension = loadMeta().ascensionUnlocked;
      this.refresh();
    }, UiColors.ready);
    this.button(CX + 120, 492, 210, 52, 'Main menu', () => {
      abandonRun();
      this.toMenu();
    });
  }

  private confirmAbandon(): void {
    const panel = this.add.container(CX, GAME_HEIGHT / 2).setDepth(50);
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5).setInteractive();
    panel.add([shade, addThemedPanel(this, 0, 0, 480, 200, { alpha: 0.98 })]);
    panel.add(this.add.text(0, -50, 'Abandon this campaign?', title(26)).setOrigin(0.5));
    panel.add(this.add.text(0, -14, 'Glory already earned is kept.', body(15)).setOrigin(0.5));
    const yes = new UiButton(this, -100, 50, 160, 44, {
      onPress: () => {
        panel.destroy();
        abandonRun();
        this.refresh();
      },
      framed: true,
      tint: 0x6a2a2a,
    });
    yes.add(this.add.text(0, 0, 'Abandon', title(20, UiTextColors.parchment)).setOrigin(0.5));
    const no = new UiButton(this, 100, 50, 160, 44, { onPress: () => panel.destroy(), framed: true });
    no.add(this.add.text(0, 0, 'Keep going', title(20, UiTextColors.parchment)).setOrigin(0.5));
    panel.add([yes.container, no.container]);
  }

  private drawRelicBar(run: ConquestRun): void {
    if (run.relics.length === 0) return;
    const y = GAME_HEIGHT - 36;
    const g = this.add2(this.add.graphics());
    const label = this.add2(this.add.text(0, y, 'Relics', title(18)).setOrigin(0, 0.5));
    const width = label.width + 14 + run.relics.length * 34;
    let x = CX - width / 2;
    label.setX(x);
    x += label.width + 26;
    for (const id of run.relics) {
      const relic = RELICS.find((r) => r.id === id);
      this.drawEmblem(g, x, y, 13, RELIC_COLORS[id] ?? UiColors.gold);
      const hit = this.add2(this.add.zone(x, y, 30, 30).setInteractive());
      const tip = this.add2(
        this.add
          .text(x, y - 30, relic ? `${relic.name}: ${relic.about}` : id, body(13, UiTextColors.parchment, { backgroundColor: '#1c1826', padding: { x: 8, y: 4 } }))
          .setOrigin(0.5, 1)
          .setVisible(false)
          .setDepth(30),
      );
      hit.on('pointerover', () => tip.setVisible(true));
      hit.on('pointerout', () => tip.setVisible(false));
      x += 34;
    }
  }

  /** A faceted gem in a gold setting. */
  private drawEmblem(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number): void {
    const light = Phaser.Display.Color.IntegerToColor(color).lighten(25).color;
    const dark = Phaser.Display.Color.IntegerToColor(color).darken(25).color;
    g.fillStyle(0x2a2233, 1).fillCircle(x, y, r + 3);
    g.lineStyle(2, UiColors.gold, 1).strokeCircle(x, y, r + 2);
    g.fillStyle(dark, 1).fillPoints([{ x, y: y - r }, { x: x + r * 0.8, y }, { x, y: y + r }, { x: x - r * 0.8, y }], true);
    g.fillStyle(color, 1).fillPoints([{ x, y: y - r }, { x: x + r * 0.8, y }, { x, y: y + r * 0.2 }, { x: x - r * 0.8, y }], true);
    g.fillStyle(light, 1).fillPoints([{ x, y: y - r }, { x: x + r * 0.35, y: y - r * 0.2 }, { x: x - r * 0.35, y: y - r * 0.2 }], true);
  }

  private toggleHall(): void {
    if (this.hall) {
      this.hall.destroy();
      this.hall = null;
      return;
    }
    const w = 700;
    const rowH = 64;
    const h = 130 + GLORY_UNLOCKS.length * rowH;
    const panel = this.add.container(CX, GAME_HEIGHT / 2 + 20).setDepth(60);
    const shade = this.add.rectangle(0, -20, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();
    shade.on('pointerdown', () => this.toggleHall());
    panel.add([shade, addThemedPanel(this, 0, 0, w, h, { alpha: 0.98 })]);
    const meta = loadMeta();
    panel.add(this.add.text(0, -h / 2 + 34, 'Hall of Glory', title(32)).setOrigin(0.5));
    panel.add(this.add.text(0, -h / 2 + 68, `Glory to spend: ${meta.glory}`, body(16, UiTextColors.title)).setOrigin(0.5));
    GLORY_UNLOCKS.forEach((unlock, i) => {
      const y = -h / 2 + 116 + i * rowH;
      const owned = meta.unlocks.includes(unlock.id);
      panel.add(this.add.text(-w / 2 + 30, y - 12, unlock.name, title(20, owned ? '#8fe08f' : UiTextColors.gold)).setOrigin(0, 0.5));
      panel.add(this.add.text(-w / 2 + 30, y + 12, unlock.about, body(14)).setOrigin(0, 0.5));
      if (owned) {
        panel.add(this.add.text(w / 2 - 90, y, 'Owned', title(18, '#8fe08f')).setOrigin(0.5));
        return;
      }
      const buy = new UiButton(this, w / 2 - 90, y, 130, 40, {
        onPress: () => {
          if (!buyUnlock(unlock.id)) return;
          this.toggleHall();
          this.toggleHall();
          this.gloryText.setText(`Glory ${loadMeta().glory}`);
        },
        framed: true,
        tint: UiColors.ready,
      });
      buy.add(this.add.text(0, 0, `${unlock.cost} Glory`, title(17, UiTextColors.parchment)).setOrigin(0.5));
      buy.setEnabled(meta.glory >= unlock.cost);
      panel.add(buy.container);
    });
    const close = new UiButton(this, w / 2 - 26, -h / 2 + 26, 32, 30, { onPress: () => this.toggleHall() });
    close.add(this.add.text(0, 0, 'x', body(16)).setOrigin(0.5));
    panel.add(close.container);
    this.hall = panel;
  }

  private toMenu(): void {
    this.scene.start(SCENE_KEYS.menu);
  }
}
