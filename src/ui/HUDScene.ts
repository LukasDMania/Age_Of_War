import Phaser from 'phaser';
import { getAge } from '@config/ages.config';
import type { AiDifficultyName } from '@config/ai.config';
import { AGE_BANNER_MS, baseMaxHp, GAME_HEIGHT, GAME_SPEEDS, GAME_WIDTH, SCENE_KEYS } from '@config/constants';
import { xpToNextAge } from '@state/economyOps';
import type { MatchState } from '@state/GameState';
import type { Side } from '@state/types';
import { mineGoldPerSec } from '@systems/BuildingSystem';
import { AgeUpButton } from '@ui/AgeUpButton';
import { BuildingPanel } from '@ui/BuildingPanel';
import { ResearchPanel } from '@ui/ResearchPanel';
import { HudBar } from '@ui/HudBar';
import { SpecialButton } from '@ui/SpecialButton';
import {
  addThemedPanel,
  applyUiTheme,
  UI_FONT,
  UI_TITLE_FONT,
  UiColors,
  UiTextColors,
} from '@ui/kenneyUi';
import { FX_SUPERSAMPLE } from '@utils/FxArt';
import { TurretPanel } from '@ui/TurretPanel';
import { UiButton } from '@ui/UiButton';
import { UnitBuyPanel } from '@ui/UnitBuyPanel';
import { emit, Events, on } from '@utils/EventBus';

/** Data handed over by `GameScene` when it launches the HUD. */
export interface HudSceneData {
  state: MatchState;
  /** Who plays the enemy, shown next to its age ('off' when nobody does). */
  enemyController: AiDifficultyName | 'off';
  /** The enemy AI profile's name ('' for none). */
  enemyProfile?: string;
  /** Playtest background currently shown (Phase 15). */
  backgroundName: string;
  /**
   * Set when the HUD rebuilds itself in the new age's look after the player
   * ages up (2026-09-26): what it can't read back from the match state.
   */
  restore?: HudRestore;
}

/** HUD view state carried over a re-skin. */
export interface HudRestore {
  tab: TabKey;
  speed: number;
  economy: { units: number; incomePerSec: number; damageMult: number; speedMult: number };
  special: { remainingMs: number; totalMs: number };
  /** Show the age-up banner for this age once rebuilt. */
  announceAge: number;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The side this HUD belongs to. The enemy only appears as a base HP bar. */
const HUD_SIDE: Side = 'player';

const MARGIN = 16;
const TOP_PANEL_WIDTH = 380;
const TOP_LEFT_HEIGHT = 126;
const AGE_UP_WIDTH = 130;
const BAR_LEFT_OFFSET = 62;
const BAR_HEIGHT = 14;

/* Bottom area: the tabbed panel, with room on its right for the special button. */
const PANEL_WIDTH = UnitBuyPanel.WIDTH;
const PANEL_HEIGHT = UnitBuyPanel.HEIGHT;
const SIDE_BUTTON_SIZE = PANEL_HEIGHT;
const SIDE_GAP = 12;
const BOTTOM_MARGIN = 10;
const PANEL_LEFT = (GAME_WIDTH - (PANEL_WIDTH + SIDE_GAP + SIDE_BUTTON_SIZE)) / 2;
const PANEL_TOP = GAME_HEIGHT - BOTTOM_MARGIN - PANEL_HEIGHT;
const TAB_WIDTH = 100;
const TAB_HEIGHT = 26;

export type TabKey = 'units' | 'turrets' | 'buildings' | 'research';
const TAB_ORDER: readonly TabKey[] = ['units', 'turrets', 'buildings', 'research'];

/**
 * The HUD, run as a separate scene on top of `GameScene`: age, gold, the XP
 * bar, the age-up button and both base HP bars at the top; at the bottom a panel with a Units
 * tab (buy units, training queue) and a Turrets tab (unlock slots, build and
 * sell turrets), plus the special attack button on its right. Click a tab or
 * press Tab to switch.
 *
 * It reads the match state once when it starts; after that every change
 * arrives as an event, so it never polls the state per frame. (On
 * `turret-built` it looks up the new turret's state once, for its refund.)
 *
 * Listens for: `gold-changed`, `xp-changed`, `base-damaged`,
 * `unit-queue-changed`, `age-changed`, `slot-unlocked`, `turret-built`,
 * `turret-upgraded`, `turret-sold`, `special-cooldown-changed`, `economy-changed` (filtered to
 * the relevant side)
 * and `match-state-changed` (buttons lock unless the match is playing).
 * Emits (through its panels and buttons): `buy-unit-requested`,
 * `buy-slot-requested`, `buy-turret-requested`, `upgrade-turret-requested`,
 * `sell-turret-requested`, `special-requested`, `age-up-requested`.
 */
export class HUDScene extends Phaser.Scene {
  private state!: MatchState;
  private cleanups: (() => void)[] = [];
  private ageText!: Phaser.GameObjects.Text;
  private enemyAgeText!: Phaser.GameObjects.Text;
  private enemyController: AiDifficultyName | 'off' = 'off';
  private goldText!: Phaser.GameObjects.Text;
  private incomeText!: Phaser.GameObjects.Text;
  private penaltyText!: Phaser.GameObjects.Text;
  private xpBar!: HudBar;
  private baseBars!: Record<Side, HudBar>;
  private unitPanel!: UnitBuyPanel;
  private turretPanel!: TurretPanel;
  private buildingPanel!: BuildingPanel;
  private researchPanel!: ResearchPanel;
  private speedButton!: UiButton;
  private speedText!: Phaser.GameObjects.Text;
  private speed = 1;
  private backgroundText!: Phaser.GameObjects.Text;
  private backgroundName = '';
  private lastEconomy = { units: 0, incomePerSec: 0, damageMult: 1, speedMult: 1 };
  private specialButton!: SpecialButton;
  private ageUpButton!: AgeUpButton;
  private pauseButton!: UiButton;
  private tabs!: Record<TabKey, UiButton>;
  private activeTab: TabKey = 'units';
  private data0!: HudSceneData;
  private lastSpecial = { remainingMs: 0, totalMs: 1 };

  constructor() {
    super({ key: SCENE_KEYS.hud });
  }

  init(data: HudSceneData): void {
    this.data0 = data;
    this.state = data.state;
    this.enemyController = data.enemyController;
    this.backgroundName = data.backgroundName;
    this.cleanups = [];
    this.activeTab = data.restore?.tab ?? 'units';
    this.lastSpecial = data.restore?.special ?? { remainingMs: 0, totalMs: 1 };
  }

  create(): void {
    const own = this.state[HUD_SIDE];
    // The HUD wears the player's age (palette, pattern, trim).
    applyUiTheme(own.age);
    this.baseBars = { player: this.buildTopLeft(), enemy: this.buildTopRight() };
    this.ageUpButton = new AgeUpButton(
      this,
      HUD_SIDE,
      MARGIN + TOP_PANEL_WIDTH + 8 + AGE_UP_WIDTH / 2,
      12 + TOP_LEFT_HEIGHT / 2,
      AGE_UP_WIDTH,
      TOP_LEFT_HEIGHT,
      own.age,
      own.xp,
    );

    addThemedPanel(this, PANEL_LEFT + PANEL_WIDTH / 2, PANEL_TOP + PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, { alpha: 0.96 });
    this.unitPanel = new UnitBuyPanel(this, HUD_SIDE, PANEL_LEFT, PANEL_TOP, {
      gold: own.gold,
      age: own.age,
      queue: own.trainingQueue,
    });
    this.turretPanel = new TurretPanel(this, HUD_SIDE, PANEL_LEFT, PANEL_TOP, {
      gold: own.gold,
      age: own.age,
      unlockedSlots: own.unlockedSlots,
      turrets: own.turrets,
    });
    this.buildingPanel = new BuildingPanel(this, HUD_SIDE, own, PANEL_LEFT, PANEL_TOP);
    this.researchPanel = new ResearchPanel(this, HUD_SIDE, own, PANEL_LEFT, PANEL_TOP);
    this.specialButton = new SpecialButton(
      this,
      HUD_SIDE,
      PANEL_LEFT + PANEL_WIDTH + SIDE_GAP + SIDE_BUTTON_SIZE / 2,
      PANEL_TOP + PANEL_HEIGHT / 2,
      SIDE_BUTTON_SIZE,
      own.age,
    );
    this.tabs = {
      units: this.buildTab(0, 'Units', 'units'),
      turrets: this.buildTab(1, 'Turrets', 'turrets'),
      buildings: this.buildTab(2, 'Buildings', 'buildings'),
      research: this.buildTab(3, 'Research', 'research'),
    };
    this.showTab(this.activeTab, false);
    this.pauseButton = new UiButton(this, GAME_WIDTH / 2, 34, 44, 40, {
      onPress: () => emit(Events.PauseRequested, {}),
      tint: UiColors.panelDark,
    });
    this.pauseButton.add(
      this.add.text(0, 0, 'II', { fontFamily: UI_FONT, fontSize: '18px', color: UiTextColors.parchment }).setOrigin(0.5),
    );
    // Playtest speed (Phase 14): cycles 1x, 2x, 3x, 4x, 8x.
    this.speed = 1;
    this.speedButton = new UiButton(this, GAME_WIDTH / 2 + 54, 34, 52, 40, {
      onPress: () => {
        const next = GAME_SPEEDS[(GAME_SPEEDS.indexOf(this.speed) + 1) % GAME_SPEEDS.length] ?? 1;
        emit(Events.GameSpeedRequested, { multiplier: next });
      },
      tint: UiColors.panelDark,
    });
    this.speedText = this.add
      .text(0, 0, '1x', { fontFamily: UI_TITLE_FONT, fontSize: '18px', color: UiTextColors.parchment })
      .setOrigin(0.5);
    this.speedButton.add(this.speedText);
    // Playtest: cycle the background options (also the B key).
    const backgroundButton = new UiButton(this, GAME_WIDTH / 2 + 54 + 26 + 8 + 75, 34, 150, 40, {
      onPress: () => emit(Events.BackgroundCycleRequested, {}),
      tint: UiColors.panelDark,
    });
    this.backgroundText = this.add
      .text(0, 0, '', { fontFamily: UI_FONT, fontSize: '11px', color: UiTextColors.parchment })
      .setOrigin(0.5);
    backgroundButton.add(this.backgroundText);
    this.showBackgroundName(this.backgroundName);
    this.input.keyboard?.addCapture('TAB');
    this.input.keyboard?.on('keydown-TAB', () =>
      this.showTab(TAB_ORDER[(TAB_ORDER.indexOf(this.activeTab) + 1) % TAB_ORDER.length] ?? 'units'),
    );
    this.setLocked(this.state.phase !== 'playing');

    // Carried over a re-skin: speed, money-unit economy, special cooldown.
    const restore = this.data0.restore;
    if (restore) {
      this.speed = restore.speed;
      this.speedText.setText(`${restore.speed}x`).setColor(restore.speed === 1 ? UiTextColors.parchment : UiTextColors.gold);
      this.lastEconomy = { ...restore.economy };
      this.refreshIncome();
      this.announceAge(restore.announceAge);
    }
    this.specialButton.setCooldown(this.lastSpecial.remainingMs, this.lastSpecial.totalMs);

    // One-time read of the starting values; events keep them current.
    this.showAge(own.age);
    this.showGold(own.gold);
    this.showXp(own.xp, xpToNextAge(this.state, HUD_SIDE));
    this.showBaseHp('player', this.state.player.baseHp, baseMaxHp(this.state.player.age));
    this.showBaseHp('enemy', this.state.enemy.baseHp, baseMaxHp(this.state.enemy.age));

    this.cleanups.push(
      on(Events.GoldChanged, ({ side, gold }) => {
        if (side === HUD_SIDE) this.showGold(gold);
      }),
      on(Events.XpChanged, ({ side, xp, xpToNext }) => {
        if (side !== HUD_SIDE) return;
        this.showXp(xp, xpToNext);
        this.ageUpButton.setXp(xp);
      }),
      on(Events.BaseDamaged, ({ side, hp, maxHp }) => this.showBaseHp(side, hp, maxHp)),
      on(Events.UnitQueueChanged, ({ side, queue }) => {
        if (side === HUD_SIDE) this.unitPanel.setQueue(queue);
      }),
      on(Events.AgeChanged, ({ side, age }) => {
        this.showBaseHp(side, this.state[side].baseHp, baseMaxHp(age));
        if (side !== HUD_SIDE) {
          this.showEnemyAge(age);
          this.announceEnemyAge(age);
          return;
        }
        // Rebuild in the new age's look (it reads everything else back
        // from the match state), then show the age-up banner.
        this.scene.restart({
          ...this.data0,
          backgroundName: this.backgroundName,
          restore: {
            tab: this.activeTab,
            speed: this.speed,
            economy: { ...this.lastEconomy },
            special: { ...this.lastSpecial },
            announceAge: age,
          },
        } satisfies HudSceneData);
      }),
      on(Events.SpecialCooldownChanged, ({ side, remainingMs, totalMs }) => {
        if (side !== HUD_SIDE) return;
        this.lastSpecial = { remainingMs, totalMs };
        this.specialButton.setCooldown(remainingMs, totalMs);
      }),
      on(Events.SlotUnlocked, ({ side, slotIndex }) => {
        if (side === HUD_SIDE) this.turretPanel.setUnlockedSlots(slotIndex + 1);
      }),
      on(Events.TurretBuilt, ({ side, slotIndex }) => {
        if (side === HUD_SIDE) this.turretPanel.setTurret(slotIndex, this.state[side].turrets[slotIndex] ?? null);
      }),
      on(Events.TurretUpgraded, ({ side, slotIndex }) => {
        if (side === HUD_SIDE) this.turretPanel.setTurret(slotIndex, this.state[side].turrets[slotIndex] ?? null);
      }),
      on(Events.TurretSold, ({ side, slotIndex }) => {
        if (side === HUD_SIDE) this.turretPanel.setTurret(slotIndex, null);
      }),
      on(Events.EconomyChanged, ({ side, economyUnits, incomePerSec, damageMult, speedMult }) => {
        if (side !== HUD_SIDE) return;
        this.lastEconomy = { units: economyUnits, incomePerSec, damageMult, speedMult };
        this.refreshIncome();
      }),
      on(Events.BuildingUpgraded, ({ side }) => {
        if (side !== HUD_SIDE) return;
        this.buildingPanel.rebuild();
        this.researchPanel.rebuild();
        this.refreshIncome();
      }),
      on(Events.ResearchCompleted, ({ side }) => {
        if (side === HUD_SIDE) this.researchPanel.rebuild();
      }),
      on(Events.BuildingPerkChosen, ({ side }) => {
        if (side !== HUD_SIDE) return;
        this.buildingPanel.rebuild();
        this.researchPanel.rebuild();
        this.refreshIncome();
      }),
      on(Events.BackgroundChanged, ({ name }) => {
        this.backgroundName = name;
        this.showBackgroundName(name);
      }),
      on(Events.GameSpeedChanged, ({ multiplier }) => {
        this.speed = multiplier;
        this.speedText.setText(`${multiplier}x`).setColor(multiplier === 1 ? UiTextColors.parchment : UiTextColors.gold);
      }),
      on(Events.MatchStateChanged, ({ to }) => this.setLocked(to !== 'playing')),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  /** Age, gold, XP and the player's base HP. Returns the base HP bar. */
  private buildTopLeft(): HudBar {
    const height = TOP_LEFT_HEIGHT;
    const left = MARGIN;
    const top = 12;
    addThemedPanel(this, left + TOP_PANEL_WIDTH / 2, top + height / 2, TOP_PANEL_WIDTH, height);

    this.ageText = this.add
      .text(left + 16, top + 22, '', {
        fontFamily: UI_TITLE_FONT,
        fontSize: '22px',
        color: UiTextColors.title,
        stroke: UiTextColors.stroke,
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5);
    this.add.image(left + TOP_PANEL_WIDTH - 98, top + 22, 'fx-coin').setScale(1.7 / FX_SUPERSAMPLE);
    this.goldText = this.add
      .text(left + TOP_PANEL_WIDTH - 84, top + 22, '', {
        fontFamily: UI_TITLE_FONT,
        fontSize: '24px',
        color: UiTextColors.gold,
        stroke: UiTextColors.stroke,
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5);

    const barLeft = left + BAR_LEFT_OFFSET;
    const barWidth = TOP_PANEL_WIDTH - BAR_LEFT_OFFSET - 16;
    this.label(left + 16, top + 52, 'XP');
    this.xpBar = new HudBar(this, barLeft, top + 52, barWidth, BAR_HEIGHT, { color: UiColors.xp });
    this.label(left + 16, top + 80, 'Base');
    const baseBar = new HudBar(this, barLeft, top + 80, barWidth, BAR_HEIGHT, { colorByRatio: true });

    // Money units (Phase 9): what they earn, and what they cost the army.
    this.label(left + 16, top + 106, 'Money');
    this.incomeText = this.add
      .text(barLeft + 8, top + 106, '', { fontFamily: UI_FONT, fontSize: '13px', color: UiTextColors.dim })
      .setOrigin(0, 0.5);
    this.penaltyText = this.add
      .text(left + TOP_PANEL_WIDTH - 16, top + 106, '', { fontFamily: UI_FONT, fontSize: '13px', color: '#f08a80' })
      .setOrigin(1, 0.5);
    this.lastEconomy = { units: 0, incomePerSec: 0, damageMult: 1, speedMult: 1 };
    this.refreshIncome();
    return baseBar;
  }

  /** The enemy's age, who controls it, and its base HP. Returns the HP bar. */
  private buildTopRight(): HudBar {
    const height = 74;
    const left = GAME_WIDTH - MARGIN - TOP_PANEL_WIDTH;
    const top = 12;
    addThemedPanel(this, left + TOP_PANEL_WIDTH / 2, top + height / 2, TOP_PANEL_WIDTH, height);
    this.enemyAgeText = this.add
      .text(left + 16, top + 22, '', {
        fontFamily: UI_TITLE_FONT,
        fontSize: '20px',
        color: UiTextColors.title,
        stroke: UiTextColors.stroke,
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5);
    const profile = this.data0.enemyProfile && this.data0.enemyProfile !== 'Classic' ? ` · ${this.data0.enemyProfile}` : '';
    const controller = this.enemyController === 'off' ? 'No AI' : `${capitalize(this.enemyController)} AI${profile}`;
    this.add
      .text(left + TOP_PANEL_WIDTH - 16, top + 22, controller, { fontFamily: UI_FONT, fontSize: '14px', color: UiTextColors.dim })
      .setOrigin(1, 0.5);
    this.label(left + 16, top + 52, 'Base');
    const barLeft = left + BAR_LEFT_OFFSET;
    const barWidth = TOP_PANEL_WIDTH - BAR_LEFT_OFFSET - 16;
    this.showEnemyAge(this.state.enemy.age);
    return new HudBar(this, barLeft, top + 52, barWidth, BAR_HEIGHT, { colorByRatio: true });
  }

  private buildTab(index: number, text: string, key: TabKey): UiButton {
    const x = PANEL_LEFT + 12 + TAB_WIDTH / 2 + index * (TAB_WIDTH + 6);
    const y = PANEL_TOP - TAB_HEIGHT / 2 + 2;
    const tab = new UiButton(this, x, y, TAB_WIDTH, TAB_HEIGHT, {
      onPress: () => this.showTab(key),
      tint: UiColors.panelDark,
      hoverTint: UiColors.panelHover,
    });
    tab.add(this.add.text(0, 0, text, { fontFamily: UI_FONT, fontSize: '14px', fontStyle: '600', color: UiTextColors.parchment }).setOrigin(0.5));
    return tab;
  }

  private showTab(key: TabKey, moveCamera = true): void {
    this.activeTab = key;
    this.unitPanel.setVisible(key === 'units');
    this.turretPanel.setVisible(key === 'turrets');
    this.buildingPanel.setVisible(key === 'buildings');
    this.researchPanel.setVisible(key === 'research');
    for (const tab of TAB_ORDER) this.tabs[tab].setSelected(key === tab);
    // The buildings stand behind the base: show them while their tab is open.
    if (!moveCamera) return;
    if (key === 'buildings') emit(Events.CameraFocusRequested, { target: 'buildings' });
    else if (key !== 'research') emit(Events.CameraFocusRequested, { target: 'lane' });
  }

  /** Big banner in the middle of the screen when the player ages up. */
  private announceAge(age: number): void {
    const cx = GAME_WIDTH / 2;
    const banner = this.add.container(cx, 250).setDepth(50);
    banner.add([
      addThemedPanel(this, 0, 0, 580, 124, { alpha: 0.95 }),
      this.add
        .text(0, -18, `${getAge(age).name.toUpperCase()} AGE`, {
          fontFamily: UI_TITLE_FONT,
          fontSize: '52px',
          color: UiTextColors.gold,
          stroke: UiTextColors.stroke,
          strokeThickness: 7,
        })
        .setOrigin(0.5)
        .setShadow(0, 4, 'rgba(0,0,0,0.5)', 4, true, true),
      this.add
        .text(0, 34, 'New units, turrets and special unlocked', { fontFamily: UI_FONT, fontSize: '17px', color: UiTextColors.parchment })
        .setOrigin(0.5),
    ]);
    this.showBanner(banner);
  }

  /** Smaller red notice under the enemy panel when the enemy ages up. */
  private announceEnemyAge(age: number): void {
    const text = this.add
      .text(GAME_WIDTH - MARGIN - TOP_PANEL_WIDTH / 2, 104, `Enemy reached the ${getAge(age).name} Age`, {
        fontFamily: UI_TITLE_FONT,
        fontSize: '18px',
        color: '#f08a80',
        stroke: UiTextColors.stroke,
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.showBanner(text);
  }

  /** Pops a banner in, holds it, fades it out and destroys it (real time). */
  private showBanner(target: Phaser.GameObjects.Container | Phaser.GameObjects.Text): void {
    target.setAlpha(0).setScale(0.8);
    this.tweens.chain({
      targets: target,
      tweens: [
        { alpha: 1, scale: 1, duration: 220, ease: 'Back.easeOut' },
        { alpha: 0, delay: AGE_BANNER_MS, duration: 400, ease: 'Quad.easeIn' },
      ],
      onComplete: () => target.destroy(),
    });
  }

  private setLocked(locked: boolean): void {
    this.unitPanel.setLocked(locked);
    this.turretPanel.setLocked(locked);
    this.buildingPanel.setLocked(locked);
    this.researchPanel.setLocked(locked);
    this.speedButton.setEnabled(!locked);
    this.specialButton.setLocked(locked);
    this.ageUpButton.setLocked(locked);
    this.pauseButton.setEnabled(!locked);
  }

  private showBackgroundName(name: string): void {
    this.backgroundText.setText(`BG: ${name}`);
  }

  private label(x: number, y: number, text: string): void {
    this.add.text(x, y, text, { fontFamily: UI_FONT, fontSize: '14px', fontStyle: '600', color: UiTextColors.dim }).setOrigin(0, 0.5);
  }

  private showAge(age: number): void {
    this.ageText.setText(`${getAge(age).name} Age`);
  }

  private showEnemyAge(age: number): void {
    this.enemyAgeText.setText(`Enemy · ${getAge(age).name} Age`);
  }

  private showGold(gold: number): void {
    this.goldText.setText(String(Math.floor(gold)));
    this.unitPanel.setGold(gold);
    this.turretPanel.setGold(gold);
    this.buildingPanel.refreshButtons();
    this.researchPanel.refreshButtons();
  }

  private showXp(xp: number, xpToNext: number | null): void {
    if (xpToNext === null) this.xpBar.setValue(1, 1, `${Math.floor(xp)} (final age)`);
    else this.xpBar.setValue(xp, xpToNext, `${Math.floor(xp)} / ${xpToNext}`);
  }

  /** The money units' income and the penalty on the rest of the army. */
  /** Income line: Mine plus money units, and the money units' army penalty. */
  private refreshIncome(): void {
    const { units, incomePerSec, damageMult, speedMult } = this.lastEconomy;
    const mine = mineGoldPerSec(this.state[HUD_SIDE]);
    const total = mine + incomePerSec;
    this.incomeText
      .setText(total > 0 ? `+${total.toFixed(1)} gold/s` : 'no income')
      .setColor(total > 0 ? UiTextColors.gold : UiTextColors.dim);
    if (units === 0) {
      this.penaltyText.setText('');
      return;
    }
    const pct = (mult: number): string => `${Math.round((1 - mult) * 100)}%`;
    this.penaltyText.setText(
      damageMult === speedMult ? `army -${pct(damageMult)}` : `dmg -${pct(damageMult)} spd -${pct(speedMult)}`,
    );
  }

  private showBaseHp(side: Side, hp: number, maxHp: number): void {
    this.baseBars[side].setValue(hp, maxHp, `${Math.ceil(hp)} / ${maxHp}`);
  }

  private teardown(): void {
    for (const off of this.cleanups) off();
    this.cleanups = [];
    this.unitPanel.destroy();
    this.specialButton.destroy();
    this.ageUpButton.destroy();
  }
}
