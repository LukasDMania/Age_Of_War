import Phaser from 'phaser';
import { HANGAR_FLOOR_Y, HANGAR_MECH_X } from '@/art/hangarDraw';
import { mechSlotAnchors } from '@/art/mechDraw';
import type { RigAnim } from '@/art/rigFigure';
import { getAge } from '@config/ages.config';
import { baseMaxHp, GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '@config/constants';
import { MECH_OPTIONS, MECH_SLOT_NAMES, MECH_SLOTS, type MechDesign, type MechSlot } from '@config/mech.config';
import {
  designRoles,
  designStatCaps,
  designStats,
  lockedSlot,
  mechPart,
  type MechStatKey,
  type MechStats,
} from '@entities/mechDesign';
import type { MatchState } from '@state/GameState';
import type { MechState, Side } from '@state/types';
import { mechBuildMs, mechForgeLevel, mechPrice, mechRejection, type MechRejection } from '@systems/MechSystem';
import { addPanel, applyUiTheme, UI_FONT, UI_TITLE_FONT, UiColors, UiTextColors, UiTextures } from '@ui/kenneyUi';
import { keyHint, KeyboardControls } from '@ui/keymap';
import { MechBlueprints, BLUEPRINT_COUNT } from '@ui/mechBlueprints';
import { UiButton } from '@ui/UiButton';
import { emit, Events, on } from '@utils/EventBus';
import { ensureHangarBackdrop } from '@utils/HangarArt';
import { drawMechPreview, mechPreviewFit } from '@utils/MechArt';
import { TEAM_COLORS } from '@utils/RigArt';

export interface HangarSceneData {
  state: MatchState;
  side: Side;
}

/* Layout (1280 x 720). */
const TOP_H = 52;
const PANEL_TOP = TOP_H + 14;
const PANEL_BOTTOM = GAME_HEIGHT - 40;
const DRAWER_X = 16;
const DRAWER_W = 330;
const SHEET_W = 340;
const SHEET_X = GAME_WIDTH - 16 - SHEET_W;
const ROW_H = 46;
const ROW_GAP = 4;
/** The big Mech: shown size of its texture. */
const MECH_W = 420;
const MECH_H = 480;
const MECH_KEY = 'hangar-mech';
/** A preview animation loop, ms. */
const LOOP_MS = 1100;
/** Redraw the moving Mech at most this often, ms. */
const REDRAW_MS = 33;

const BLUE = 0x0d2a4a;
const BLUE_LINE = 0x3a78c0;
const BLUE_TEXT = '#8cc4ff';
const GREEN = 0x6fcf6f;
const RED = 0xe0554a;
const RED_TEXT = '#f08a80';

const STAT_ROWS: readonly { key: MechStatKey; label: string; format: (v: number) => string }[] = [
  { key: 'hp', label: 'HP', format: (v) => Math.round(v).toLocaleString('en-US') },
  { key: 'dps', label: 'DPS', format: (v) => `${Math.round(v)}/s` },
  { key: 'range', label: 'Range', format: (v) => (v > 0 ? `${Math.round(v)}` : 'none') },
  { key: 'speed', label: 'Speed', format: (v) => `${Math.round(v)}` },
  { key: 'armor', label: 'Armor', format: (v) => `${Math.round(v * 100)}%` },
];

/** Where each slot's callout sits: left or right of the Mech, and its height. */
const CALLOUTS: Readonly<Record<MechSlot, { x: number; y: number }>> = {
  head: { x: HANGAR_MECH_X - 175, y: 170 },
  torso: { x: HANGAR_MECH_X - 175, y: 330 },
  legs: { x: HANGAR_MECH_X - 175, y: 500 },
  right: { x: HANGAR_MECH_X + 185, y: 230 },
  left: { x: HANGAR_MECH_X + 185, y: 390 },
  module: { x: HANGAR_MECH_X + 185, y: 540 },
};
const CALLOUT_W = 132;
const CALLOUT_H = 40;

function text(size: number, color: string, weight = '500'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: weight, color };
}

interface PartRow {
  id: string;
  button: UiButton;
  name: Phaser.GameObjects.Text;
  about: Phaser.GameObjects.Text;
  foot: Phaser.GameObjects.Text;
}

interface StatBar {
  fill: Phaser.GameObjects.Graphics;
  value: Phaser.GameObjects.Text;
}

/**
 * The hangar (Mech expansion, `docs/MECH_EXPANSION.md` section 1): a
 * full-screen scene over the battle where the player designs and builds
 * the Mech. It replaces the Workshop tab; B opens and closes it. The battle
 * keeps running behind it (PROPOSED: it is a real-time game; the top bar
 * shows your base and the build).
 *
 * - The Mech stands large on a gantry in the age's room (`art/hangarDraw.ts`).
 *   Each slot is a hotspot on the model and a callout beside it; choosing
 *   one slides out the drawer with that slot's parts.
 * - Hovering a part puts it on the model at once and plays a short loop
 *   (weapons attack, legs walk); the stat bars show what it would change
 *   as green or red ghost segments.
 * - The build sheet: cost, build time, role tags, and the Build button,
 *   which turns into the build's progress.
 * - Blueprint slots: named designs kept per browser (`ui/mechBlueprints.ts`).
 * - Parts you can't build yet are drawn as blue blueprint art with what
 *   they need.
 *
 * Keys: 1-5 pick a slot, Q / E switch its part, R builds, T the next
 * blueprint, B or Esc closes. It never touches game state: it reads the
 * side for gold, age and Forge level, and asks with `build-mech-requested`.
 *
 * Listens for: `gold-changed`, `mech-changed`, `building-upgraded`,
 * `age-changed`, `match-state-changed`, `base-damaged`.
 * Emits: `build-mech-requested`.
 */
export class HangarScene extends Phaser.Scene {
  private state!: MatchState;
  private side: Side = 'player';
  private blueprints!: MechBlueprints;
  private design!: MechDesign;
  private slot: MechSlot = 'legs';
  /** The part under the pointer in the drawer (previewed), if any. */
  private hover: string | null = null;
  private hoverSlot: MechSlot | null = null;
  private mech: MechState = { alive: false, build: null };
  private cleanups: (() => void)[] = [];
  private backdrop!: Phaser.GameObjects.Image;
  private mechImage!: Phaser.GameObjects.Image;
  private hotspotRing!: Phaser.GameObjects.Graphics;
  private leaders!: Phaser.GameObjects.Graphics;
  private callouts = new Map<MechSlot, { button: UiButton; part: Phaser.GameObjects.Text }>();
  private drawer!: Phaser.GameObjects.Container;
  private drawerTitle!: Phaser.GameObjects.Text;
  private rows: PartRow[] = [];
  private bars = new Map<MechStatKey, StatBar>();
  private caps!: MechStats;
  private costText!: Phaser.GameObjects.Text;
  private sheetText!: Phaser.GameObjects.Text;
  private rolesText!: Phaser.GameObjects.Text;
  private buildButton!: UiButton;
  private buildLabel!: Phaser.GameObjects.Text;
  private buildProgress!: Phaser.GameObjects.Graphics;
  private blueprintButtons: UiButton[] = [];
  private blueprintName!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private baseText!: Phaser.GameObjects.Text;
  private animStart = 0;
  private lastDraw = -Infinity;
  private drawnKey = '';
  private zones: Phaser.GameObjects.Zone[] = [];

  constructor() {
    super({ key: SCENE_KEYS.hangar });
  }

  init(data: HangarSceneData): void {
    this.state = data.state;
    this.side = data.side;
    this.blueprints = new MechBlueprints();
    this.design = this.blueprints.design;
    this.slot = 'legs';
    this.hover = null;
    this.hoverSlot = null;
    const own = this.state[this.side].mech;
    this.mech = { alive: own.alive, build: own.build ? { ...own.build } : null };
    this.cleanups = [];
    this.rows = [];
    this.bars = new Map();
    this.callouts = new Map();
    this.blueprintButtons = [];
    this.drawnKey = '';
    this.zones = [];
  }

  create(): void {
    const me = this.state[this.side];
    applyUiTheme(me.age);
    this.caps = designStatCaps(me.age);
    // Swallow clicks so nothing reaches the battle underneath.
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1).setOrigin(0).setInteractive();
    this.backdrop = this.add.image(0, 0, ensureHangarBackdrop(this, me.age)).setOrigin(0);
    this.mechImage = this.add.image(HANGAR_MECH_X, HANGAR_FLOOR_Y, '__DEFAULT');
    this.leaders = this.add.graphics();
    this.hotspotRing = this.add.graphics();
    this.buildTopBar();
    this.buildHotspots();
    this.buildDrawer();
    this.buildSheet();
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 18, this.hintText(), { ...text(13, UiTextColors.parchment, '600'), stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5);

    const keys = new KeyboardControls(this, () => ['workshop', 'battle']);
    for (const [i, slot] of MECH_SLOTS.entries()) keys.on(`slot-${i + 1}`, () => this.selectSlot(slot));
    keys
      .on('mech-prev', () => this.cycle(-1))
      .on('mech-next', () => this.cycle(1))
      .on('mech-build', () => this.build())
      .on('mech-blueprint', () => this.switchBlueprint(this.blueprints.active + 1))
      .on('tab-workshop', () => this.close())
      .on('hangar-close', () => this.close());

    this.cleanups.push(
      on(Events.GoldChanged, ({ side, gold }) => {
        if (side !== this.side) return;
        this.goldText.setText(String(Math.floor(gold)));
        this.refreshBuild();
      }),
      on(Events.MechChanged, ({ side, alive, build }) => {
        if (side !== this.side) return;
        this.mech = { alive, build };
        this.refreshBuild();
      }),
      on(Events.BuildingUpgraded, ({ side }) => {
        if (side === this.side) this.refreshAll();
      }),
      on(Events.AgeChanged, ({ side, age }) => {
        if (side !== this.side) return;
        applyUiTheme(age);
        this.caps = designStatCaps(age);
        this.backdrop.setTexture(ensureHangarBackdrop(this, age));
        this.refreshAll();
      }),
      on(Events.BaseDamaged, ({ side, hp, maxHp }) => {
        if (side === this.side) this.showBase(hp, maxHp);
      }),
      on(Events.MatchStateChanged, ({ to }) => {
        if (to === 'gameover') this.close();
        else this.refreshBuild();
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.cleanups) off();
      this.cleanups = [];
    });
    this.showBase(me.baseHp, baseMaxHp(me.age));
    this.selectSlot(this.slot, false);
    this.refreshAll();
  }

  override update(time: number): void {
    // Only redraw when the picture changes (a loop plays while hovering).
    const look = this.previewDesign();
    const anim = this.previewAnim();
    const u = anim === 'stand' ? 0 : ((time - this.animStart) % LOOP_MS) / LOOP_MS;
    const key = `${JSON.stringify(look)}|${this.state[this.side].age}|${anim}|${this.previewLocked()}`;
    if (key === this.drawnKey && (anim === 'stand' || time - this.lastDraw < REDRAW_MS)) return;
    this.drawnKey = key;
    this.lastDraw = time;
    this.drawMech(look, anim, u);
  }

  /* ---- Actions ------------------------------------------------------------------------------ */

  private close(): void {
    this.scene.stop();
  }

  private selectSlot(slot: MechSlot, animate = true): void {
    this.slot = slot;
    this.hover = null;
    for (const [s, c] of this.callouts) c.button.setSelected(s === slot);
    this.fillDrawer();
    if (animate) {
      this.drawer.x = -DRAWER_W - 30;
      this.tweens.add({ targets: this.drawer, x: 0, duration: 200, ease: 'Cubic.easeOut' });
    }
    this.drawHotspot();
  }

  /** The chosen slot's part, one step on (+1) or back (-1). */
  private cycle(by: number): void {
    const options = MECH_OPTIONS[this.slot];
    const index = options.indexOf(this.design[this.slot]);
    const next = options[(index + by + options.length) % options.length];
    if (next) this.pick(next);
  }

  private pick(part: string): void {
    this.design = { ...this.design, [this.slot]: part } as MechDesign;
    this.blueprints.setDesign(this.design);
    this.refreshAll();
  }

  private build(): boolean {
    if (mechRejection(this.state, this.side, this.design) !== null) return false;
    emit(Events.BuildMechRequested, { side: this.side, design: { ...this.design } });
    this.buildButton.press();
    return true;
  }

  private switchBlueprint(index: number): void {
    this.blueprints.select(index % BLUEPRINT_COUNT);
    this.design = this.blueprints.design;
    this.refreshAll();
  }

  private renameBlueprint(): void {
    const name = window.prompt('Name this blueprint', this.blueprints.name);
    if (name === null) return;
    this.blueprints.rename(this.blueprints.active, name);
    this.refreshBlueprints();
  }

  /* ---- Building the screen ------------------------------------------------------------------ */

  /** A panel of blueprint paper: dark blue with a grid, and a Kenney frame. */
  private blueprintPanel(x: number, y: number, w: number, h: number): Phaser.GameObjects.GameObject[] {
    const g = this.add.graphics();
    g.fillStyle(BLUE, 0.88).fillRect(x, y, w, h);
    g.lineStyle(1, BLUE_LINE, 0.25);
    for (let gx = x + 16; gx < x + w; gx += 16) g.lineBetween(gx, y, gx, y + h);
    for (let gy = y + 16; gy < y + h; gy += 16) g.lineBetween(x, gy, x + w, gy);
    const frame = addPanel(this, UiTextures.frame, x + w / 2, y + h / 2, w + 6, h + 6, 0x9fd0ff);
    return [g, frame];
  }

  private buildTopBar(): void {
    this.blueprintPanel(0, 0, GAME_WIDTH, TOP_H);
    this.titleText = this.add
      .text(20, TOP_H / 2, '', { fontFamily: UI_TITLE_FONT, fontSize: '26px', color: UiTextColors.title, stroke: '#000', strokeThickness: 5 })
      .setOrigin(0, 0.5);
    this.add.text(430, TOP_H / 2, 'Gold', text(14, BLUE_TEXT, '600')).setOrigin(0, 0.5);
    this.goldText = this.add.text(470, TOP_H / 2, '', { fontFamily: UI_TITLE_FONT, fontSize: '22px', color: UiTextColors.gold }).setOrigin(0, 0.5);
    this.baseText = this.add.text(600, TOP_H / 2, '', text(14, UiTextColors.parchment, '600')).setOrigin(0, 0.5);
    const close = new UiButton(this, GAME_WIDTH - 110, TOP_H / 2, 196, 36, { onPress: () => this.close(), tint: UiColors.panelDark, framed: true });
    const key = keyHint('tab-workshop');
    close.add(this.add.text(0, 0, `Back to battle${key ? ` (${key})` : ''}`, text(15, UiTextColors.parchment, '600')).setOrigin(0.5));
    this.goldText.setText(String(Math.floor(this.state[this.side].gold)));
  }

  private showBase(hp: number, maxHp: number): void {
    const low = hp < maxHp * 0.35;
    this.baseText.setText(`Base ${Math.ceil(hp).toLocaleString('en-US')}  ·  the battle goes on`).setColor(low ? RED_TEXT : UiTextColors.parchment);
  }

  /** Hotspots on the model and a callout per slot with a line to its part. */
  private buildHotspots(): void {
    for (const slot of MECH_SLOTS) {
      const c = CALLOUTS[slot];
      const button = new UiButton(this, c.x, c.y, CALLOUT_W, CALLOUT_H, {
        onPress: () => this.selectSlot(slot),
        tint: UiColors.panelDark,
        hoverTint: UiColors.panelHover,
        onHover: (over) => {
          this.hoverSlot = over ? slot : this.hoverSlot === slot ? null : this.hoverSlot;
          this.drawHotspot();
        },
      });
      const index = MECH_SLOTS.indexOf(slot) + 1;
      const hint = keyHint(`slot-${index}`);
      button.add(
        this.add.text(-CALLOUT_W / 2 + 8, -9, `${hint ? `${hint} ` : ''}${MECH_SLOT_NAMES[slot]}`, text(11, UiTextColors.dim, '600')).setOrigin(0, 0.5),
      );
      const part = this.add.text(-CALLOUT_W / 2 + 8, 8, '', text(14, UiTextColors.parchment, '600')).setOrigin(0, 0.5);
      button.add(part);
      this.callouts.set(slot, { button, part });
    }
    // Invisible zones over the model itself (arms last, so they win where they overlap the torso).
    for (const slot of ['module', 'legs', 'torso', 'head', 'right', 'left'] as const) {
      const zone = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
      zone.setData('slot', slot);
      zone.on('pointerover', () => {
        this.hoverSlot = slot;
        this.drawHotspot();
      });
      zone.on('pointerout', () => {
        if (this.hoverSlot === slot) this.hoverSlot = null;
        this.drawHotspot();
      });
      zone.on('pointerdown', () => this.selectSlot(slot));
      this.zones.push(zone);
    }
  }

  /** Screen position of a rig point on the big Mech. */
  private toScreen(p: readonly [number, number]): { x: number; y: number } {
    const fit = mechPreviewFit(MECH_W, MECH_H);
    return { x: HANGAR_MECH_X + p[0] * fit.scale, y: HANGAR_FLOOR_Y + p[1] * fit.scale };
  }

  /** Places the zones and callout lines for the current legs (hip height changes). */
  private layoutHotspots(): void {
    const anchors = mechSlotAnchors(this.design.legs);
    const fit = mechPreviewFit(MECH_W, MECH_H);
    for (const zone of this.zones) {
      const a = anchors[zone.getData('slot') as MechSlot];
      const p = this.toScreen(a.at);
      const size = a.r * 2 * fit.scale;
      zone.setPosition(p.x, p.y).setSize(size, size);
      zone.input?.hitArea.setTo(0, 0, size, size);
    }
    this.leaders.clear();
    for (const slot of MECH_SLOTS) {
      const p = this.toScreen(anchors[slot].at);
      const c = CALLOUTS[slot];
      const fromX = c.x + (c.x < HANGAR_MECH_X ? CALLOUT_W / 2 : -CALLOUT_W / 2);
      this.leaders.lineStyle(2, 0x9fd0ff, 0.7).lineBetween(fromX, c.y, p.x, p.y);
      this.leaders.fillStyle(0x9fd0ff, 0.9).fillCircle(p.x, p.y, 4);
    }
  }

  /** A ring on the model around the hovered or chosen slot. */
  private drawHotspot(): void {
    const anchors = mechSlotAnchors(this.design.legs);
    const fit = mechPreviewFit(MECH_W, MECH_H);
    this.hotspotRing.clear();
    for (const [slot, alpha] of [
      [this.slot, 0.9],
      [this.hoverSlot, 0.5],
    ] as const) {
      if (!slot) continue;
      const a = anchors[slot];
      const p = this.toScreen(a.at);
      this.hotspotRing.lineStyle(3, 0xffe08a, alpha).strokeCircle(p.x, p.y, a.r * fit.scale + 4);
    }
  }

  private buildDrawer(): void {
    this.drawer = this.add.container(0, 0);
    this.drawer.add(this.blueprintPanel(DRAWER_X, PANEL_TOP, DRAWER_W, PANEL_BOTTOM - PANEL_TOP));
    this.drawerTitle = this.add.text(DRAWER_X + 14, PANEL_TOP + 20, '', { fontFamily: UI_TITLE_FONT, fontSize: '20px', color: UiTextColors.title }).setOrigin(0, 0.5);
    const keys = [keyHint('mech-prev'), keyHint('mech-next')].filter(Boolean).join(' / ');
    this.drawer.add([
      this.drawerTitle,
      this.add.text(DRAWER_X + DRAWER_W - 14, PANEL_TOP + 20, keys ? `${keys} switch` : '', text(12, BLUE_TEXT, '600')).setOrigin(1, 0.5),
    ]);
  }

  /** The drawer's rows for the chosen slot. */
  private fillDrawer(): void {
    for (const row of this.rows) row.button.destroy();
    this.rows = [];
    this.drawerTitle.setText(MECH_SLOT_NAMES[this.slot]);
    const options = MECH_OPTIONS[this.slot];
    const top = PANEL_TOP + 44;
    const room = PANEL_BOTTOM - 10 - top;
    const rowH = Math.min(ROW_H, Math.floor(room / options.length) - ROW_GAP);
    options.forEach((id, i) => {
      const w = DRAWER_W - 20;
      const button = new UiButton(this, DRAWER_X + 10 + w / 2, top + i * (rowH + ROW_GAP) + rowH / 2, w, rowH, {
        onPress: () => this.pick(id),
        tint: UiColors.panelDark,
        hoverTint: UiColors.panelHover,
        onHover: (over) => this.hoverPart(over ? id : null),
      });
      const name = this.add.text(-w / 2 + 10, -rowH / 2 + 12, '', text(14, UiTextColors.parchment, '600')).setOrigin(0, 0.5);
      const about = this.add.text(-w / 2 + 10, rowH / 2 - 12, '', text(11, UiTextColors.dim)).setOrigin(0, 0.5);
      const foot = this.add.text(w / 2 - 10, -rowH / 2 + 12, '', text(13, UiTextColors.gold, '600')).setOrigin(1, 0.5);
      button.add(name, about, foot);
      this.drawer.add(button.container);
      this.rows.push({ id, button, name, about, foot });
    });
    this.refreshDrawer();
  }

  private buildSheet(): void {
    const x = SHEET_X;
    let y = PANEL_TOP;
    this.blueprintPanel(x, y, SHEET_W, PANEL_BOTTOM - PANEL_TOP);
    // Blueprint slots.
    this.blueprintName = this.add.text(x + 14, y + 20, '', { fontFamily: UI_TITLE_FONT, fontSize: '20px', color: UiTextColors.title }).setOrigin(0, 0.5);
    this.blueprintName.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.renameBlueprint());
    const bpKey = keyHint('mech-blueprint');
    this.add.text(x + SHEET_W - 14, y + 20, bpKey ? `${bpKey} next` : '', text(12, BLUE_TEXT, '600')).setOrigin(1, 0.5);
    y += 44;
    const bw = (SHEET_W - 28 - (BLUEPRINT_COUNT - 1) * 6) / BLUEPRINT_COUNT;
    for (let i = 0; i < BLUEPRINT_COUNT; i++) {
      const b = new UiButton(this, x + 14 + bw / 2 + i * (bw + 6), y + 14, bw, 28, {
        onPress: () => this.switchBlueprint(i),
        tint: UiColors.panelDark,
        hoverTint: UiColors.panelHover,
      });
      b.add(this.add.text(0, 0, String(i + 1), text(14, UiTextColors.parchment, '600')).setOrigin(0.5));
      this.blueprintButtons.push(b);
    }
    y += 44;
    // Stat bars.
    for (const row of STAT_ROWS) {
      this.add.text(x + 14, y + 9, row.label, text(13, BLUE_TEXT, '600')).setOrigin(0, 0.5);
      const fill = this.add.graphics().setPosition(x + 76, y + 2);
      const value = this.add.text(x + SHEET_W - 14, y + 9, '', text(13, UiTextColors.parchment, '600')).setOrigin(1, 0.5);
      this.bars.set(row.key, { fill, value });
      y += 28;
    }
    y += 8;
    // Build sheet.
    this.add.text(x + 14, y + 10, 'Cost', text(13, BLUE_TEXT, '600')).setOrigin(0, 0.5);
    this.costText = this.add.text(x + SHEET_W - 14, y + 10, '', { fontFamily: UI_TITLE_FONT, fontSize: '22px', color: UiTextColors.gold }).setOrigin(1, 0.5);
    y += 28;
    this.sheetText = this.add.text(x + 14, y, '', { ...text(13, UiTextColors.parchment), lineSpacing: 3 }).setOrigin(0, 0);
    y += 44;
    this.rolesText = this.add.text(x + 14, y, '', { ...text(13, UiTextColors.gold, '600'), wordWrap: { width: SHEET_W - 28 } }).setOrigin(0, 0);
    // Build button.
    const bh = 46;
    this.buildButton = new UiButton(this, x + SHEET_W / 2, PANEL_BOTTOM - 14 - bh / 2, SHEET_W - 28, bh, {
      onPress: () => this.build(),
      tint: UiColors.ready,
      hoverTint: UiColors.panelHover,
      framed: true,
    });
    this.buildProgress = this.add.graphics();
    this.buildLabel = this.add.text(0, 0, '', text(17, UiTextColors.parchment, '600')).setOrigin(0.5);
    this.buildButton.add(this.buildProgress, this.buildLabel);
  }

  private hintText(): string {
    const slots = [keyHint('slot-1'), keyHint(`slot-${MECH_SLOTS.length}` as 'slot-5')].filter(Boolean).join('-');
    return [
      slots && `${slots} choose a slot`,
      `${keyHint('mech-prev')} ${keyHint('mech-next')} switch part`,
      `${keyHint('mech-build')} build`,
      `${keyHint('mech-blueprint')} next blueprint (click its name to rename)`,
      `${keyHint('hangar-close')} or ${keyHint('tab-workshop')} back`,
    ]
      .filter(Boolean)
      .join('  ·  ');
  }

  /* ---- Refreshing --------------------------------------------------------------------------- */

  private hoverPart(id: string | null): void {
    this.hover = id;
    this.animStart = this.time.now;
    this.refreshStats();
  }

  /** The design as shown: with the hovered part tried on. */
  private previewDesign(): MechDesign {
    return this.hover ? ({ ...this.design, [this.slot]: this.hover } as MechDesign) : this.design;
  }

  private previewAnim(): RigAnim {
    if (!this.hover) return 'stand';
    if (this.slot === 'legs') return 'walk';
    if (this.slot === 'left' || this.slot === 'right') return 'attack';
    return 'stand';
  }

  private previewLocked(): boolean {
    return lockedSlot(this.previewDesign(), mechForgeLevel(this.state[this.side])) !== null;
  }

  private drawMech(look: MechDesign, anim: RigAnim, u: number): void {
    const age = this.state[this.side].age;
    drawMechPreview(this, MECH_KEY, { ...look, age }, TEAM_COLORS[this.side], {
      width: MECH_W,
      height: MECH_H,
      supersample: 1,
      anim,
      u,
      blueprint: this.previewLocked(),
    });
    const fit = mechPreviewFit(MECH_W, MECH_H);
    this.mechImage.setTexture(MECH_KEY).setOrigin(fit.feetX / MECH_W, fit.feetY / MECH_H);
  }

  private refreshAll(): void {
    const age = this.state[this.side].age;
    this.titleText.setText(`Hangar · ${getAge(age).name} Age`);
    for (const slot of MECH_SLOTS) {
      const c = this.callouts.get(slot);
      if (!c) continue;
      c.part.setText(mechPart(this.design, slot).name).setScale(1);
      if (c.part.width > CALLOUT_W - 14) c.part.setScale((CALLOUT_W - 14) / c.part.width);
    }
    this.layoutHotspots();
    this.drawHotspot();
    this.refreshDrawer();
    this.refreshStats();
    this.refreshBlueprints();
  }

  private refreshDrawer(): void {
    const me = this.state[this.side];
    const forge = mechForgeLevel(me);
    for (const row of this.rows) {
      const part = mechPart({ ...this.design, [this.slot]: row.id } as MechDesign, this.slot);
      const locked = (part.forge ?? 0) > forge;
      row.name.setText(part.name).setColor(locked ? BLUE_TEXT : UiTextColors.parchment);
      row.about.setText(part.about);
      row.foot
        .setText(locked ? `🔒 Forge ${(part.forge ?? 0) - me.traits.mechForgeBonus}` : `${'●'.repeat(part.tier)}${'○'.repeat(3 - part.tier)}  ${Math.round(part.cost * getAge(me.age).scale)}`)
        .setColor(locked ? RED_TEXT : UiTextColors.gold);
      row.button.setSelected(row.id === this.design[this.slot]);
    }
  }

  private refreshStats(): void {
    const age = this.state[this.side].age;
    const now = designStats(this.design, age);
    const next = this.hover ? designStats(this.previewDesign(), age) : now;
    const width = SHEET_W - 76 - 70;
    for (const row of STAT_ROWS) {
      const bar = this.bars.get(row.key);
      if (!bar) continue;
      const cap = Math.max(1e-6, this.caps[row.key]);
      const a = Math.min(1, now[row.key] / cap) * width;
      const b = Math.min(1, next[row.key] / cap) * width;
      const g = bar.fill.clear();
      g.fillStyle(0x000000, 0.35).fillRect(0, 0, width, 14);
      g.fillStyle(0x9fd0ff, 0.9).fillRect(0, 0, Math.min(a, b), 14);
      if (b > a) g.fillStyle(GREEN, 0.9).fillRect(a, 0, b - a, 14);
      if (b < a) g.fillStyle(RED, 0.9).fillRect(b, 0, a - b, 14);
      g.lineStyle(1, 0x9fd0ff, 0.6).strokeRect(0, 0, width, 14);
      const changed = next[row.key] !== now[row.key];
      bar.value
        .setText(row.format(next[row.key]))
        .setColor(!changed ? UiTextColors.parchment : next[row.key] > now[row.key] ? '#8fe08f' : RED_TEXT);
    }
    const shown = this.previewDesign();
    const me = this.state[this.side];
    this.sheetText.setText(
      [`Build time  ${Math.round(mechBuildMs(me, shown) / 1000)} s`, `Toughness  ${Math.round(next.hp / Math.max(0.05, 1 - next.armor)).toLocaleString('en-US')} effective HP`].join('\n'),
    );
    const roles = designRoles(shown);
    this.rolesText.setText(roles.length ? `Roles: ${roles.join(' · ')}` : 'Roles: none (unarmed)');
    this.refreshBuild();
  }

  private refreshBlueprints(): void {
    this.blueprintName.setText(this.blueprints.name);
    this.blueprintButtons.forEach((b, i) => b.setSelected(i === this.blueprints.active));
  }

  private refreshBuild(): void {
    if (!this.buildButton) return;
    const me = this.state[this.side];
    const shown = this.previewDesign();
    const cost = mechPrice(me, shown);
    this.costText.setText(cost.toLocaleString('en-US')).setColor(me.gold >= cost ? UiTextColors.gold : RED_TEXT);
    const rejection = mechRejection(this.state, this.side, this.design);
    this.buildButton.setEnabled(rejection === null);
    this.buildProgress.clear();
    const build = this.mech.build;
    const w = SHEET_W - 40;
    if (build) {
      const done = 1 - build.remainingMs / Math.max(1, build.totalMs);
      this.buildProgress.fillStyle(UiColors.good, 0.55).fillRect(-w / 2, -17, w * done, 34);
      this.buildLabel.setText(build.remainingMs > 0 ? `Building ${Math.ceil(build.remainingMs / 1000)}s` : 'Waiting for room');
      this.buildButton.container.setAlpha(1);
      return;
    }
    const labels: Record<MechRejection, string> = {
      'not-playing': 'Paused',
      'player-only': 'Not for this side',
      invalid: 'Unknown part',
      locked: 'Part locked',
      building: 'Building',
      alive: 'Mech in battle',
      'cannot-afford': 'Need gold',
    };
    const key = keyHint('mech-build');
    this.buildLabel.setText(rejection === null ? `Build${key ? ` (${key})` : ''}` : labels[rejection]);
  }
}
