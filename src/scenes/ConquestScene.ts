import Phaser from 'phaser';
import { AGE_NAMES, getAge } from '@config/ages.config';
import { AI_DIFFICULTIES } from '@config/ai.config';
import { findAiProfile } from '@config/aiGenome.config';
import { BACKGROUNDS } from '@config/backgrounds.config';
import {
  ACHIEVEMENTS,
  ASCENSION,
  BOSSES,
  CAMP_REST_COST,
  CAMP_UPGRADES,
  CHAPTERS,
  COMMANDERS,
  LEGACY,
  LEGACY_TIER_REQUIRES,
  MAP_COLUMNS,
  MAP_ROWS,
  MUTATORS,
  NODE_INFO,
  NODE_REWARDS,
  PATH_IDS,
  PATHS,
  RELICS,
  START_LIMITS,
  type Relic,
} from '@config/conquest.config';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '@config/constants';
import { unitArtKey } from '@config/unitArt.config';
import type { GameSceneData } from '@/scenes/GameScene';
import { Backdrop } from '@entities/Backdrop';
import { unitArtFor } from '@entities/unitArt';
import {
  abandonRun,
  achievementDone,
  battleSetup,
  buyCampUpgrade,
  buyUnlock,
  campOffer,
  campUpgradeCost,
  chooseEventOption,
  chooseNode,
  commanderUnlocked,
  continueRun,
  currentEvent,
  finishBattle,
  legacyTierOpen,
  loadMeta,
  loadRun,
  pathCounts,
  reachableRows,
  rerollRelics,
  restAtCamp,
  startRun,
  takeRelic,
  type ConquestRun,
  type MapNode,
} from '@state/conquestState';
import { addThemedPanel, applyUiTheme, UiColors, UiTextColors } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import {
  body,
  DIFFICULTY_COLORS,
  drawBanner,
  drawCrate,
  drawGem,
  drawNode,
  RELIC_COLORS,
  title,
} from '@ui/experimental/conquestWidgets';
import { ensureRigArt } from '@utils/RigArt';
import { flipOriginX } from '@utils/spriteOrigin';

const CX = GAME_WIDTH / 2;

/** A relic's gem color: its own, else its path's, else gold. */
function relicColor(relic: Relic | undefined, id: string): number {
  return RELIC_COLORS[id] ?? (relic?.path ? PATHS[relic.path].color : UiColors.gold);
}

/** "Vanguard · keystone" style label of a relic's path and rarity. */
function relicTag(relic: Relic): string {
  const path = relic.path ? PATHS[relic.path].name : 'General';
  return relic.keystone ? `${path} · KEYSTONE` : relic.rare ? `${path} · rare` : path;
}
const MAP_X = [150, 360, 570, 800] as const;
const MAP_Y = [300, 405, 510] as const;
const NODE_R = 30;
const DETAIL_X = 1060;

/**
 * Conquest mode's campaign screen (prototype, feature `conquest`; reworked
 * 2026-09-27 into a five-chapter campaign). It shows, depending on the run:
 * the start (commander and ascension), the chapter map, a battle's result
 * and relic reward, camps, events, treasure and the end of the run, plus the
 * Hall of Glory (Legacy unlocks, achievements). Battles are ordinary
 * GameScene matches started with `GameSceneData.conquest`; GameScene
 * reports the result to `state/conquestState.ts` and returns here.
 *
 * Keys: 1-4 pick a node or option, Enter confirms, Esc goes back.
 */
export class ConquestScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;
  private content: Phaser.GameObjects.Container | null = null;
  private hall: Phaser.GameObjects.Container | null = null;
  private hallTab: 'legacy' | 'achievements' = 'legacy';
  private gloryText!: Phaser.GameObjects.Text;
  private ascension = 0;
  private commander = 'chieftain';
  /** The map node whose details are shown. */
  private selected: MapNode | null = null;
  private hotkeys: (() => void)[] = [];
  private confirm: (() => void) | null = null;

  constructor() {
    super({ key: SCENE_KEYS.conquest });
  }

  create(): void {
    applyUiTheme(0);
    this.cameras.main.setBackgroundColor(0x2b3346);
    this.backdrop = new Backdrop(this);
    this.backdrop.show(BACKGROUNDS.find((b) => b.id === 'cloudy-peaks') ?? BACKGROUNDS[0]!);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x10121c, 0.4).setOrigin(0).setDepth(-5);
    const meta = loadMeta();
    this.ascension = meta.ascensionUnlocked;
    this.selected = null;
    this.hall = null;

    this.add.text(CX, 36, 'CONQUEST', title(46, '#f7cf5a')).setOrigin(0.5).setShadow(0, 4, 'rgba(0,0,0,0.45)', 4, true, true);
    const back = new UiButton(this, 84, 34, 130, 40, { onPress: () => this.toMenu(), framed: true });
    back.add(this.add.text(0, 0, '< Menu', title(18, UiTextColors.parchment)).setOrigin(0.5));
    const hall = new UiButton(this, GAME_WIDTH - 104, 34, 180, 40, { onPress: () => this.toggleHall(), framed: true, tint: UiColors.ready });
    hall.add(this.add.text(0, 0, 'Hall of Glory', title(18, UiTextColors.parchment)).setOrigin(0.5));
    this.gloryText = this.add.text(GAME_WIDTH - 104, 66, '', body(15, UiTextColors.gold)).setOrigin(0.5);

    const keys = this.input.keyboard;
    (['ONE', 'TWO', 'THREE', 'FOUR'] as const).forEach((key, i) => keys?.on(`keydown-${key}`, () => this.hotkeys[i]?.()));
    keys?.on('keydown-ESC', () => (this.hall ? this.toggleHall() : this.toMenu()));
    keys?.on('keydown-ENTER', () => {
      if (!this.hall) this.confirm?.();
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

  /* ---- Frame ----------------------------------------------------------------------------- */

  private refresh(): void {
    this.content?.destroy();
    this.content = this.add.container(0, 0);
    this.hotkeys = [];
    this.confirm = null;
    this.gloryText.setText(`Glory ${loadMeta().glory}`);
    const run = loadRun();
    if (!run) {
      this.showStart();
      return;
    }
    this.drawRunBar(run);
    this.drawChapterTrack(run);
    switch (run.status) {
      case 'map':
        this.showMap(run);
        break;
      case 'battle':
        this.showInterrupted(run);
        break;
      case 'result':
        this.showResult(run);
        break;
      case 'camp':
        this.showCamp(run);
        break;
      case 'event':
        this.showEvent(run);
        break;
      case 'treasure':
        this.showTreasure(run);
        break;
      case 'won':
      case 'lost':
        this.showEnd(run);
        break;
    }
    this.drawRelicBar(run);
  }

  private add2<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.content?.add(object);
    return object;
  }

  private button(x: number, y: number, w: number, h: number, label: string, onPress: () => void, tint?: number): UiButton {
    const b = new UiButton(this, x, y, w, h, { onPress, framed: true, ...(tint !== undefined ? { tint } : {}) });
    b.add(this.add.text(0, 0, label, title(Math.min(22, h * 0.45), UiTextColors.parchment)).setOrigin(0.5));
    this.add2(b.container);
    return b;
  }

  /** Commander, banners, supplies, chapter and ascension. */
  private drawRunBar(run: ConquestRun): void {
    const y = 96;
    this.add2(addThemedPanel(this, CX, y, 1000, 42, { alpha: 0.95 }));
    const commander = COMMANDERS.find((c) => c.id === run.commander);
    this.add2(this.add.text(CX - 480, y, commander?.name ?? '', title(18)).setOrigin(0, 0.5));
    const g = this.add2(this.add.graphics());
    const bx = CX - 250;
    for (let i = 0; i < run.maxBanners; i++) drawBanner(g, bx + i * 22, y + 13, 1.1, i >= run.banners);
    drawCrate(g, CX + 20, y, 1);
    this.add2(this.add.text(CX + 36, y, `${run.supplies} supplies`, body(15, UiTextColors.title)).setOrigin(0, 0.5));
    const chapter = CHAPTERS[run.chapter]!;
    this.add2(
      this.add
        .text(CX + 480, y, `${run.ascension > 0 ? `A${run.ascension} · ` : ''}Chapter ${run.chapter + 1}: ${chapter.name}`, body(15, UiTextColors.gold))
        .setOrigin(1, 0.5),
    );
  }

  /** The five ages of the campaign, the current one highlighted. */
  private drawChapterTrack(run: ConquestRun): void {
    const y = 152;
    const gap = 150;
    const x0 = CX - 2 * gap;
    const g = this.add2(this.add.graphics());
    g.lineStyle(5, 0x1c1826, 0.9).lineBetween(x0, y, x0 + 4 * gap, y);
    if (run.chapter > 0) g.lineStyle(5, UiColors.gold, 1).lineBetween(x0, y, x0 + run.chapter * gap, y);
    CHAPTERS.forEach((chapter, i) => {
      const x = x0 + i * gap;
      const done = i < run.chapter || run.status === 'won';
      const current = i === run.chapter && run.status !== 'won';
      g.fillStyle(0x1c1826, 1).fillCircle(x, y, 16);
      g.fillStyle(done ? UiColors.gold : current ? 0x584a6e : 0x2a2233, 1).fillCircle(x, y, 13);
      g.lineStyle(2, current ? 0xfff6de : UiColors.trim, 1).strokeCircle(x, y, 15);
      this.add2(this.add.text(x, y, done ? '✓' : String(i + 1), title(15, done ? '#2a2233' : UiTextColors.parchment)).setOrigin(0.5));
      this.add2(this.add.text(x, y + 24, AGE_NAMES[chapter.age] ?? '', title(13, current ? UiTextColors.title : UiTextColors.parchment)).setOrigin(0.5));
    });
  }

  /** The run's archetype paths so far (offers lean toward them), above the relic bar. */
  private drawPathSummary(run: ConquestRun): void {
    const counts = pathCounts(run);
    const owned = PATH_IDS.filter((p) => counts[p] > 0).sort((a, b) => counts[b] - counts[a]);
    if (owned.length === 0) return;
    const y = GAME_HEIGHT - 56;
    const parts = owned.map((p) => this.add2(this.add.text(0, y, `${PATHS[p].name} ${counts[p]}`, title(14, PATHS[p].text)).setOrigin(0, 0.5)));
    const label = this.add2(this.add.text(0, y, 'Paths', body(13, UiTextColors.dim)).setOrigin(0, 0.5));
    const gap = 16;
    const width = label.width + gap + parts.reduce((sum, t) => sum + t.width + gap, -gap);
    let x = CX - width / 2;
    label.setX(x);
    x += label.width + gap;
    for (const t of parts) {
      t.setX(x);
      x += t.width + gap;
    }
  }

  private drawRelicBar(run: ConquestRun): void {
    this.drawPathSummary(run);
    const y = GAME_HEIGHT - 28;
    const upgrades = CAMP_UPGRADES.filter((u) => (run.upgrades[u.id] ?? 0) > 0)
      .map((u) => `${u.name} ${run.upgrades[u.id]}`)
      .join(' · ');
    if (run.relics.length === 0 && !upgrades) return;
    const g = this.add2(this.add.graphics());
    let x = CX - (run.relics.length * 30) / 2 - (upgrades ? 160 : 0);
    if (run.relics.length > 0) this.add2(this.add.text(x - 8, y, 'Relics', title(16)).setOrigin(1, 0.5));
    for (const id of run.relics) {
      const relic = RELICS.find((r) => r.id === id);
      drawGem(g, x + 14, y, 11, relicColor(relic, id));
      const hit = this.add2(this.add.zone(x + 14, y, 28, 28).setInteractive());
      const tip = this.add2(
        this.add
          .text(x + 14, y - 26, relic ? `${relic.name} (${relicTag(relic)}): ${relic.about}` : id, body(13, UiTextColors.parchment, { backgroundColor: '#1c1826', padding: { x: 8, y: 4 } }))
          .setOrigin(0.5, 1)
          .setVisible(false)
          .setDepth(30),
      );
      hit.on('pointerover', () => tip.setVisible(true));
      hit.on('pointerout', () => tip.setVisible(false));
      x += 30;
    }
    if (upgrades) this.add2(this.add.text(x + 20, y, `Camp: ${upgrades}`, body(13, UiTextColors.dim)).setOrigin(0, 0.5));
  }

  /* ---- Start ------------------------------------------------------------------------------ */

  private showStart(): void {
    const meta = loadMeta();
    if (!COMMANDERS.some((c) => c.id === this.commander && commanderUnlocked(c))) this.commander = 'chieftain';
    this.add2(this.add.text(CX, 100, 'March through five ages, from the Stone age to the stars', body(18, UiTextColors.title)).setOrigin(0.5));
    this.add2(
      this.add
        .text(
          CX,
          130,
          'Each chapter is a map of battles, camps and events, ending with a warlord. Banners are your lives; supplies buy upgrades.',
          body(14, UiTextColors.parchment),
        )
        .setOrigin(0.5),
    );
    this.add2(this.add.text(CX, 178, 'Choose your commander', title(24)).setOrigin(0.5));
    const w = 162;
    const gap = 10;
    const x0 = CX - ((COMMANDERS.length - 1) * (w + gap)) / 2;
    COMMANDERS.forEach((c, i) => {
      const unlocked = commanderUnlocked(c);
      const selected = c.id === this.commander;
      const card = new UiButton(this, x0 + i * (w + gap), 290, w, 180, {
        onPress: () => {
          if (!unlocked) return;
          this.commander = c.id;
          this.refresh();
        },
        framed: true,
        tint: selected ? UiColors.ready : UiColors.panelDark,
        hoverTint: UiColors.panelMid,
      });
      const lockText = ACHIEVEMENTS.find((a) => a.id === c.unlock)?.about ?? '';
      card.add(
        this.add.text(0, -66, c.name.replace('The ', ''), title(18, unlocked ? UiTextColors.gold : UiTextColors.dim)).setOrigin(0.5),
        this.add
          .text(0, -40, unlocked ? c.about : `Locked: ${lockText}`, body(12, unlocked ? UiTextColors.parchment : UiTextColors.dim, { align: 'center', wordWrap: { width: w - 18 } }))
          .setOrigin(0.5, 0),
        this.add
          .text(0, 72, c.path ? `Leans ${PATHS[c.path].name}` : 'No path', title(12, c.path ? PATHS[c.path].text : UiTextColors.dim))
          .setOrigin(0.5),
      );
      if (!unlocked) card.container.setAlpha(0.6);
      this.add2(card.container);
    });
    if (meta.ascensionUnlocked > 0) {
      const y = 420;
      const label = this.add2(this.add.text(CX, y, '', title(20)).setOrigin(0.5));
      const about = this.add2(this.add.text(CX, y + 22, '', body(13, UiTextColors.dim)).setOrigin(0.5));
      const show = (): void => {
        const a = this.ascension;
        label.setText(a === 0 ? 'Ascension 0 (normal)' : `Ascension ${a}`);
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
      this.button(CX - 250, y + 8, 40, 40, '<', () => step(-1));
      this.button(CX + 250, y + 8, 40, 40, '>', () => step(1));
      show();
    }
    const march = this.button(CX, 510, 260, 58, 'MARCH!', () => this.begin(), UiColors.ready);
    this.tweens.add({ targets: march.container, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.confirm = () => this.begin();
    const s = meta.stats;
    const record =
      meta.runsPlayed > 0
        ? `Runs ${meta.runsPlayed} · won ${s.runsWon} · battles won ${s.battlesWon} · furthest: chapter ${s.maxChapter}`
        : 'Your first campaign awaits';
    this.add2(this.add.text(CX, 580, record, body(15, UiTextColors.dim)).setOrigin(0.5));
    const unlocked = ACHIEVEMENTS.filter((a) => achievementDone(a.id)).length;
    this.add2(
      this.add
        .text(CX, 606, `Achievements ${unlocked}/${ACHIEVEMENTS.length} · Legacy ${meta.unlocks.length}/${LEGACY.length}`, body(14, UiTextColors.dim))
        .setOrigin(0.5),
    );
  }

  private begin(): void {
    startRun(this.commander, this.ascension);
    this.selected = null;
    this.refresh();
  }

  /* ---- Map ---------------------------------------------------------------------------------- */

  private nodePos(node: MapNode): { x: number; y: number } {
    return { x: MAP_X[Math.min(node.col, MAP_COLUMNS)]!, y: node.type === 'boss' ? MAP_Y[1] : MAP_Y[node.row]! };
  }

  private showMap(run: ConquestRun): void {
    const open = reachableRows(run);
    const bossOpen = run.step >= MAP_COLUMNS;
    const g = this.add2(this.add.graphics());
    // Roads between columns: row r leads to rows r-1..r+1; the last column leads to the boss.
    for (let col = 0; col < MAP_COLUMNS; col++) {
      for (let row = 0; row < MAP_ROWS; row++) {
        const onPath = run.path[col] === row;
        const targets =
          col === MAP_COLUMNS - 1
            ? [{ x: MAP_X[MAP_COLUMNS], y: MAP_Y[1], lit: onPath && bossOpen }]
            : [row - 1, row, row + 1]
                .filter((r) => r >= 0 && r < MAP_ROWS)
                .map((r) => ({ x: MAP_X[col + 1]!, y: MAP_Y[r]!, lit: onPath && run.path[col + 1] === r }));
        for (const t of targets) {
          g.lineStyle(t.lit ? 5 : 3, t.lit ? UiColors.gold : 0xd8c8a8, t.lit ? 1 : 0.25);
          g.lineBetween(MAP_X[col]! + NODE_R, MAP_Y[row]!, t.x - NODE_R, t.y);
        }
      }
    }
    const firstOpen = bossOpen ? run.boss : run.columns[run.step]?.[open[0] ?? 0];
    const isOpen = (node: MapNode): boolean => (node.type === 'boss' ? bossOpen : node.col === run.step && open.includes(node.row));
    const selected = this.selected && isOpen(this.selected) ? this.selected : (firstOpen ?? null);
    this.selected = selected;
    for (let col = 0; col < MAP_COLUMNS; col++) {
      for (const node of run.columns[col]!) {
        const state = run.path[col] === node.row ? 'done' : isOpen(node) ? 'open' : col > run.step ? 'ahead' : 'closed';
        this.drawMapNode(g, node, state);
        if (state === 'open') this.hotkeys[node.row] = () => this.select(node);
      }
    }
    this.drawMapNode(g, run.boss, bossOpen ? 'open' : 'ahead');
    if (bossOpen) this.hotkeys[0] = () => this.select(run.boss);
    this.add2(this.add.text(MAP_X[0] - NODE_R, 232, bossOpen ? 'The warlord awaits' : 'Choose your road', title(18, UiTextColors.title)).setOrigin(0, 0.5));
    if (selected) this.showNodeDetails(run, selected);
    const abandon = new UiButton(this, 84, GAME_HEIGHT - 28, 130, 32, { onPress: () => this.confirmAbandon(), tint: 0x4a2a2a });
    abandon.add(this.add.text(0, 0, 'Abandon run', body(13)).setOrigin(0.5));
    this.add2(abandon.container);
  }

  private drawMapNode(g: Phaser.GameObjects.Graphics, node: MapNode, state: 'open' | 'done' | 'closed' | 'ahead'): void {
    const { x, y } = this.nodePos(node);
    const r = node.type === 'boss' ? NODE_R + 12 : NODE_R;
    drawNode(g, node.type, x, y, r, state);
    const name = node.type === 'boss' && node.battle?.boss !== undefined ? BOSSES[node.battle.boss]!.name : NODE_INFO[node.type].name;
    this.add2(
      this.add
        .text(x, y + r + 14, name, title(13, state === 'closed' ? UiTextColors.dim : UiTextColors.parchment))
        .setOrigin(0.5)
        .setAlpha(state === 'closed' ? 0.6 : 1),
    );
    if (state === 'open') {
      const ring = this.add2(this.add.circle(x, y, r + 6).setStrokeStyle(3, 0xfff6de, 0.9));
      this.tweens.add({ targets: ring, scale: 1.2, alpha: 0, duration: 1100, repeat: -1 });
      const hit = this.add2(this.add.zone(x, y, r * 2 + 10, r * 2 + 10).setInteractive({ useHandCursor: true }));
      hit.on('pointerdown', () => this.select(node));
    }
    if (this.selected === node) g.lineStyle(3, UiColors.gold, 1).strokeCircle(x, y, r + 9);
  }

  private select(node: MapNode): void {
    this.selected = node;
    this.refresh();
  }

  /** The right-hand panel: what the node is, and a button to go there. */
  private showNodeDetails(run: ConquestRun, node: MapNode): void {
    const w = 330;
    const h = 430;
    const x = DETAIL_X;
    const top = 200;
    this.add2(addThemedPanel(this, x, top + h / 2, w, h, { alpha: 0.97 }));
    const info = NODE_INFO[node.type];
    let y = top + 20;
    const line = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle, gapAfter = 6): void => {
      const t = this.add2(this.add.text(x - w / 2 + 20, y, text, { ...style, wordWrap: { width: w - 40 } }));
      y += t.height + gapAfter;
    };
    const battle = node.battle;
    if (node.type === 'boss' && battle?.boss !== undefined) {
      const boss = BOSSES[battle.boss]!;
      line(boss.name, title(24, '#f08a80'), 0);
      line(boss.title, body(14, UiTextColors.dim), 8);
      line(boss.about, body(14), 10);
    } else {
      line(info.name, title(24), 4);
      line(info.about, body(13, UiTextColors.dim), 10);
    }
    if (battle) {
      const diff = AI_DIFFICULTIES[battle.difficulty];
      const profile = findAiProfile(battle.profile);
      line(`${diff.label} · ${profile?.label ?? battle.profile}`, title(17, DIFFICULTY_COLORS[battle.difficulty]), 2);
      if (profile && node.type !== 'boss') line(profile.description, body(12, UiTextColors.dim), 8);
      for (const id of battle.mutators) {
        const m = MUTATORS.find((mm) => mm.id === id);
        if (m) line(`${m.name}: ${m.about}`, body(13, UiTextColors.gold), 3);
      }
      if (battle.mutators.length === 0) line('No battlefield rules', body(13, UiTextColors.dim), 3);
      y += 6;
      const reward = NODE_REWARDS[node.type as 'battle' | 'elite' | 'boss'](run.chapter);
      const glory = reward.glory + battle.mutators.reduce((s, id) => s + (MUTATORS.find((m) => m.id === id)?.glory ?? 0), 0) + run.ascension;
      line(
        `Win: ~${reward.supplies} supplies, ${glory} Glory${node.type === 'elite' || node.type === 'boss' ? ', a relic' : ''}${node.type === 'boss' ? ', a banner' : ''}`,
        body(13, '#8fe08f'),
        3,
      );
      line(node.type === 'boss' ? 'Lose: a banner; face him again' : 'Lose: a banner', body(13, '#f08a80'), 6);
      if (y < top + h - 150) this.drawLineup(x, top + h - 82, getAge(CHAPTERS[run.chapter]!.age).unitIds.slice(0, 3));
    }
    const label = battle ? 'FIGHT' : node.type === 'camp' ? 'MAKE CAMP' : node.type === 'treasure' ? 'OPEN' : 'GO';
    const go = (): void => this.enter(node);
    this.button(x, top + h - 30, 200, 44, label, go, UiColors.ready);
    this.confirm = go;
  }

  /** The enemy's front line of the chapter's age, standing on the detail panel. */
  private drawLineup(cx: number, groundY: number, unitIds: readonly string[]): void {
    const g = this.add2(this.add.graphics());
    g.fillStyle(0x000000, 0.25).fillEllipse(cx, groundY, 250, 12);
    unitIds.forEach((unitId, i) => {
      const art = unitArtFor(unitId);
      if (!art) return;
      ensureRigArt(this, unitId);
      this.add2(
        this.add
          .sprite(cx + [-80, -10, 70][i]!, groundY, unitArtKey(unitId, 'walk', 'enemy'), art.standFrame ?? 0)
          .setOrigin(flipOriginX(art.originX ?? 0.5, true), art.footY ?? 1)
          .setScale((art.scale ?? 1) * 0.75)
          .setFlipX(true),
      );
    });
  }

  private enter(node: MapNode): void {
    const chosen = chooseNode(node.row);
    if (!chosen) return;
    this.selected = null;
    const run = loadRun();
    if (chosen.battle && run) {
      this.startBattle(run);
      return;
    }
    this.refresh();
  }

  private startBattle(run: ConquestRun): void {
    const setup = battleSetup(run);
    if (!setup) return;
    this.scene.start(SCENE_KEYS.game, {
      ai: setup.difficulty,
      profile: setup.profile,
      conquest: { effects: setup.effects, label: setup.label, maxAge: setup.age },
    } satisfies GameSceneData);
  }

  /* ---- Node screens -------------------------------------------------------------------------- */

  private panel(h: number, heading: string, headingColor: string = UiTextColors.gold): number {
    const top = 196;
    this.add2(addThemedPanel(this, CX, top + h / 2, 900, h, { alpha: 0.97 }));
    this.add2(this.add.text(CX, top + 34, heading, title(32, headingColor)).setOrigin(0.5));
    return top;
  }

  private showInterrupted(run: ConquestRun): void {
    const top = this.panel(220, 'The battle was interrupted');
    this.add2(this.add.text(CX, top + 84, 'Fight it again from the start, or retreat (it counts as a loss: a banner).', body(16)).setOrigin(0.5));
    this.button(CX - 130, top + 150, 220, 50, 'Fight again', () => this.startBattle(run), UiColors.ready);
    this.button(CX + 130, top + 150, 220, 50, 'Retreat', () => {
      finishBattle(false);
      this.refresh();
    });
  }

  private showResult(run: ConquestRun): void {
    const result = run.lastResult;
    const won = result?.won ?? false;
    const boss = run.current?.type === 'boss';
    const heading = won ? (boss ? 'WARLORD DEFEATED!' : 'VICTORY!') : 'DEFEAT';
    const top = this.panel(run.offer.length > 0 ? 440 : 240, heading, won ? '#8fe08f' : '#f08a80');
    const parts = won
      ? [`+${result?.supplies ?? 0} supplies`, `+${result?.glory ?? 0} Glory`, ...(result?.banners ? ['+1 banner'] : [])]
      : ['You lost a banner.', boss ? 'The warlord waits: face him again when you are ready.' : 'Your army falls back and marches on.'];
    this.add2(this.add.text(CX, top + 78, parts.join('  ·  '), body(17, UiTextColors.title)).setOrigin(0.5));
    if (won && boss && run.chapter + 1 < CHAPTERS.length) {
      this.add2(this.add.text(CX, top + 104, `Onward to the ${AGE_NAMES[CHAPTERS[run.chapter + 1]!.age]} age.`, body(15, UiTextColors.gold)).setOrigin(0.5));
    }
    if (run.offer.length > 0) {
      this.add2(this.add.text(CX, top + 134, 'Choose a relic', title(20)).setOrigin(0.5));
      this.relicCards(run, top + 250);
      return;
    }
    this.button(CX, top + 180, 220, 48, 'Continue', () => this.continue(), UiColors.ready);
    this.confirm = () => this.continue();
  }

  private continue(): void {
    continueRun();
    this.selected = null;
    this.refresh();
  }

  /** Relic cards for the offer, with skip and reroll. */
  private relicCards(run: ConquestRun, y: number): void {
    const width = 196;
    const gap = 14;
    const count = run.offer.length;
    const x0 = CX - ((count - 1) * (width + gap)) / 2;
    const done = (): void => {
      // A treasure node is resolved by the pick itself; a battle shows its result first.
      if (loadRun()?.status === 'treasure') continueRun();
      this.refresh();
    };
    run.offer.forEach((id, i) => {
      const relic = RELICS.find((r) => r.id === id);
      if (!relic) return;
      const take = (): void => {
        takeRelic(id);
        done();
      };
      this.hotkeys[i] = take;
      const card = new UiButton(this, x0 + i * (width + gap), y, width, 170, { onPress: take, framed: true, tint: UiColors.panelDark, hoverTint: UiColors.panelMid });
      const gem = this.add.graphics();
      drawGem(gem, 0, -52, 18, relicColor(relic, id));
      if (relic.keystone) {
        gem.lineStyle(2, 0xfff6de, 0.9).strokeCircle(0, -52, 26);
      }
      card.add(
        gem,
        this.add.text(-width / 2 + 10, -76, `${i + 1}`, title(16, UiTextColors.dim)),
        this.add.text(0, -18, relic.name, title(19, relic.keystone ? '#ff9ae0' : relic.rare ? '#ffb86a' : UiTextColors.gold)).setOrigin(0.5),
        this.add.text(0, 2, relicTag(relic), title(12, relic.path ? PATHS[relic.path].text : UiTextColors.dim)).setOrigin(0.5),
        this.add.text(0, 16, relic.about, body(12, UiTextColors.parchment, { align: 'center', wordWrap: { width: width - 22 } })).setOrigin(0.5, 0),
      );
      this.add2(card.container);
    });
    const skip = (): void => {
      takeRelic(null);
      done();
    };
    const by = y + 122;
    if (run.rerolls > 0) {
      this.button(CX - 110, by, 190, 40, `Reroll (${run.rerolls})`, () => {
        if (rerollRelics()) this.refresh();
      });
      this.button(CX + 110, by, 190, 40, 'Skip', skip);
    } else {
      this.button(CX, by, 190, 40, 'Skip', skip);
    }
  }

  private showTreasure(run: ConquestRun): void {
    const top = this.panel(440, 'Treasure!');
    this.add2(this.add.text(CX, top + 78, 'An unguarded cache. Take one relic.', body(16)).setOrigin(0.5));
    if (run.offer.length === 0) {
      this.add2(this.add.text(CX, top + 180, 'Empty. Someone got here first.', title(22, UiTextColors.dim)).setOrigin(0.5));
      this.button(CX, top + 300, 200, 46, 'Continue', () => this.continue(), UiColors.ready);
      return;
    }
    this.relicCards(run, top + 250);
  }

  private showCamp(run: ConquestRun): void {
    const top = this.panel(460, 'Camp');
    this.add2(
      this.add
        .text(CX, top + 70, `Spend supplies on upgrades that last the rest of the run. Starting bonuses stop at +${START_LIMITS.bonusGold} gold and ${START_LIMITS.turrets} turrets.`, body(15, UiTextColors.dim))
        .setOrigin(0.5),
    );
    const colW = 420;
    campOffer(run).forEach((u, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = CX - colW / 2 - 10 + col * (colW + 20);
      const y = top + 118 + row * 64;
      const level = run.upgrades[u.id] ?? 0;
      const cost = campUpgradeCost(run, u.id);
      const name = this.add2(this.add.text(x - colW / 2, y - 12, u.name, title(17, level > 0 ? '#8fe08f' : UiTextColors.gold)).setOrigin(0, 0.5));
      if (u.path) this.add2(this.add.text(name.x + name.width + 8, y - 11, PATHS[u.path].name, title(12, PATHS[u.path].text)).setOrigin(0, 0.5));
      this.add2(this.add.text(x - colW / 2, y + 11, u.about, body(12, UiTextColors.parchment)).setOrigin(0, 0.5));
      const pips = this.add2(this.add.graphics());
      for (let p = 0; p < u.maxLevel; p++) {
        pips.fillStyle(p < level ? UiColors.gold : 0x000000, p < level ? 1 : 0.5).fillCircle(x + 70 - (u.maxLevel - p) * 11, y - 12, 4);
      }
      if (cost === null) {
        const label = level >= u.maxLevel ? 'Max' : 'Capped';
        this.add2(this.add.text(x + colW / 2, y, label, title(15, '#8fe08f')).setOrigin(1, 0.5));
        return;
      }
      const buy = new UiButton(this, x + colW / 2 - 58, y, 116, 34, {
        onPress: () => {
          if (buyCampUpgrade(u.id)) this.refresh();
        },
        framed: true,
        tint: UiColors.ready,
      });
      buy.add(this.add.text(0, 0, `${cost} supplies`, body(13)).setOrigin(0.5));
      buy.setEnabled(run.supplies >= cost);
      this.add2(buy.container);
    });
    const restOk = run.supplies >= CAMP_REST_COST && run.banners < run.maxBanners;
    const rest = this.button(CX - 140, top + 418, 260, 44, `Rest: +1 banner (${CAMP_REST_COST})`, () => {
      if (restAtCamp()) this.refresh();
    });
    rest.setEnabled(restOk);
    this.button(CX + 140, top + 418, 220, 44, 'Break camp', () => this.continue(), UiColors.ready);
    this.confirm = () => this.continue();
  }

  private showEvent(run: ConquestRun): void {
    const event = currentEvent(run);
    if (!event) {
      this.continue();
      return;
    }
    const top = this.panel(420, event.title);
    this.add2(this.add.text(CX, top + 82, event.text, body(17, UiTextColors.title, { align: 'center', wordWrap: { width: 780 } })).setOrigin(0.5));
    if (run.eventOutcome !== null) {
      this.add2(this.add.text(CX, top + 190, run.eventOutcome, title(22, UiTextColors.gold)).setOrigin(0.5));
      this.button(CX, top + 330, 200, 46, 'Continue', () => this.continue(), UiColors.ready);
      this.confirm = () => this.continue();
      return;
    }
    event.options.forEach((option, i) => {
      const y = top + 156 + i * 76;
      const affordable = run.supplies >= (option.cost ?? 0);
      const choose = (): void => {
        if (chooseEventOption(i)) this.refresh();
      };
      if (affordable) this.hotkeys[i] = choose;
      const b = new UiButton(this, CX, y, 720, 64, { onPress: choose, framed: true, tint: UiColors.panelDark, hoverTint: UiColors.panelMid });
      b.add(
        this.add.text(-340, -13, `${i + 1}  ${option.label}`, title(18, UiTextColors.gold)).setOrigin(0, 0.5),
        this.add.text(-340, 13, option.about, body(13)).setOrigin(0, 0.5),
      );
      b.setEnabled(affordable);
      this.add2(b.container);
    });
  }

  private showEnd(run: ConquestRun): void {
    const won = run.status === 'won';
    const top = this.panel(330, won ? 'THE STARS ARE YOURS' : 'THE CAMPAIGN ENDS', won ? '#8fe08f' : '#f08a80');
    const meta = loadMeta();
    const lines = [
      `${won ? 'All five ages conquered' : `Fell in chapter ${run.chapter + 1}: ${CHAPTERS[run.chapter]!.name}`}  ·  battles won ${run.wins}`,
      `Glory earned ${run.glory}  ·  Glory to spend ${meta.glory}`,
      won
        ? run.ascension + 1 <= ASCENSION.maxLevel
          ? `Ascension ${Math.min(ASCENSION.maxLevel, run.ascension + 1)} unlocked: tougher enemies, more Glory.`
          : 'You conquered the highest Ascension.'
        : 'Spend your Glory in the Hall of Glory and march again.',
    ];
    this.add2(this.add.text(CX, top + 120, lines, body(17, UiTextColors.parchment, { align: 'center', lineSpacing: 10 })).setOrigin(0.5));
    this.button(
      CX - 130,
      top + 262,
      220,
      50,
      'New campaign',
      () => {
        abandonRun();
        this.ascension = loadMeta().ascensionUnlocked;
        this.refresh();
      },
      UiColors.ready,
    );
    this.button(CX + 130, top + 262, 220, 50, 'Main menu', () => {
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

  /* ---- Hall of Glory ----------------------------------------------------------------------- */

  private toggleHall(): void {
    if (this.hall) {
      this.hall.destroy();
      this.hall = null;
      return;
    }
    this.openHall();
  }

  private openHall(): void {
    this.hall?.destroy();
    const w = 1180;
    const h = 610;
    const panel = this.add.container(CX, GAME_HEIGHT / 2 + 20).setDepth(60);
    const shade = this.add.rectangle(0, -20, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setInteractive();
    panel.add([shade, addThemedPanel(this, 0, 0, w, h, { alpha: 0.98 })]);
    const meta = loadMeta();
    panel.add(this.add.text(-w / 2 + 30, -h / 2 + 32, 'Hall of Glory', title(30)).setOrigin(0, 0.5));
    panel.add(this.add.text(-w / 2 + 30, -h / 2 + 64, `Glory to spend: ${meta.glory}`, body(16, UiTextColors.title)).setOrigin(0, 0.5));
    (['legacy', 'achievements'] as const).forEach((tab, i) => {
      const b = new UiButton(this, 60 + i * 190, -h / 2 + 40, 176, 38, {
        onPress: () => {
          this.hallTab = tab;
          this.openHall();
        },
        framed: true,
        tint: this.hallTab === tab ? UiColors.ready : UiColors.panelDark,
      });
      b.add(this.add.text(0, 0, tab === 'legacy' ? 'Legacy' : 'Achievements', title(17, UiTextColors.parchment)).setOrigin(0.5));
      panel.add(b.container);
    });
    const close = new UiButton(this, w / 2 - 30, -h / 2 + 30, 34, 32, { onPress: () => this.toggleHall() });
    close.add(this.add.text(0, 0, 'x', body(16)).setOrigin(0.5));
    panel.add(close.container);
    if (this.hallTab === 'legacy') this.legacyTab(panel, w, h);
    else this.achievementsTab(panel, w, h);
    this.hall = panel;
  }

  /** Four tiers of permanent unlocks; a tier opens after enough unlocks. */
  private legacyTab(panel: Phaser.GameObjects.Container, w: number, h: number): void {
    const meta = loadMeta();
    const colW = (w - 60) / 4;
    ([1, 2, 3, 4] as const).forEach((tier, c) => {
      const x = -w / 2 + 30 + c * colW + colW / 2;
      const open = legacyTierOpen(tier);
      panel.add(this.add.text(x, -h / 2 + 106, `Tier ${tier}`, title(20, open ? UiTextColors.gold : UiTextColors.dim)).setOrigin(0.5));
      if (!open) panel.add(this.add.text(x, -h / 2 + 128, `Opens after ${LEGACY_TIER_REQUIRES[tier]} unlocks`, body(12, UiTextColors.dim)).setOrigin(0.5));
      LEGACY.filter((l) => l.tier === tier).forEach((unlock, r) => {
        const y = -h / 2 + 184 + r * 84;
        const owned = meta.unlocks.includes(unlock.id);
        const cw = colW - 16;
        const card = new UiButton(this, x, y, cw, 76, {
          onPress: () => {
            if (buyUnlock(unlock.id)) {
              this.gloryText.setText(`Glory ${loadMeta().glory}`);
              this.openHall();
            }
          },
          tint: owned ? 0x2f4a2f : UiColors.panelDark,
          hoverTint: UiColors.panelMid,
        });
        card.add(
          this.add.text(-cw / 2 + 10, -28, unlock.name, title(15, owned ? '#8fe08f' : UiTextColors.gold)),
          this.add.text(-cw / 2 + 10, -6, unlock.about, body(11, UiTextColors.parchment, { wordWrap: { width: cw - 20 } })),
          this.add.text(cw / 2 - 10, -28, owned ? 'Owned' : `${unlock.cost} Glory`, title(13, owned ? '#8fe08f' : UiTextColors.title)).setOrigin(1, 0),
        );
        const affordable = open && meta.glory >= unlock.cost;
        card.setEnabled(owned || affordable);
        if (!owned && !affordable) card.container.setAlpha(open ? 0.7 : 0.45);
        panel.add(card.container);
      });
    });
  }

  private achievementsTab(panel: Phaser.GameObjects.Container, w: number, h: number): void {
    const meta = loadMeta();
    const colW = (w - 80) / 2;
    ACHIEVEMENTS.forEach((a, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = -w / 2 + 40 + col * (colW + 20);
      const y = -h / 2 + 100 + row * 80;
      const done = achievementDone(a.id);
      const progress = Math.min(meta.stats[a.stat], a.atLeast);
      panel.add(addThemedPanel(this, x + colW / 2, y + 30, colW, 64, { fill: done ? 0x2f4a2f : UiColors.panelDark, frame: false, pattern: false }));
      panel.add(this.add.text(x + 14, y + 16, `${done ? '✓ ' : ''}${a.name}`, title(17, done ? '#8fe08f' : UiTextColors.gold)).setOrigin(0, 0.5));
      panel.add(this.add.text(x + 14, y + 42, a.about, body(13)).setOrigin(0, 0.5));
      panel.add(this.add.text(x + colW - 14, y + 30, `${progress}/${a.atLeast}`, body(14, UiTextColors.dim)).setOrigin(1, 0.5));
    });
  }

  private toMenu(): void {
    this.scene.start(SCENE_KEYS.menu);
  }
}
