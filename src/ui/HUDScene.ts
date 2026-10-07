import Phaser from 'phaser';
import { getAge } from '@config/ages.config';
import type { AiDifficultyName } from '@config/ai.config';
import { activeBuildingIds, RESEARCH } from '@config/buildings.config';
import { AGE_BANNER_MS, AGE_CATCH_UP, baseMaxHp, GAME_HEIGHT, GAME_SPEED, GAME_SPEEDS, GAME_WIDTH, SCENE_KEYS } from '@config/constants';
import { ARMY_COUNT, type KeyActionId, type KeyContext } from '@config/keybindings.config';
import { xpToNextAge } from '@state/economyOps';
import type { MatchState } from '@state/GameState';
import { otherSide, type ArenaPhase, type Side } from '@state/types';
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
import { feature } from '@config/features.config';
import { DoctrinePopup } from '@ui/experimental/DoctrinePopup';
import { WarCryButton } from '@ui/experimental/WarCryButton';
import { TurretPanel } from '@ui/TurretPanel';
import { UiButton } from '@ui/UiButton';
import { UnitBuyPanel } from '@ui/UnitBuyPanel';
import type { HangarSceneData } from '@ui/HangarScene';
import { MechAbilityButton } from '@ui/MechAbilityButton';
import { emit, Events, on, type EventPayloads } from '@utils/EventBus';
import { ageGap } from '@systems/ageCatchUp';
import { armyFromQueue, armyLabel, getArmy, setArmy } from '@ui/compositions';
import { keyHint, KeyboardControls } from '@ui/keymap';
import type { PressModifiers } from '@ui/UiButton';

/** Data handed over by `GameScene` when it launches the HUD. */
export interface HudSceneData {
  state: MatchState;
  /** Who plays the enemy, shown next to its age ('off' when nobody does). */
  enemyController: AiDifficultyName | 'off';
  /** The enemy AI profile's name ('' for none). */
  enemyProfile?: string;
  /** Playtest background currently shown (Phase 15). */
  backgroundName: string;
  /** Mech Arena (GAME_DESIGN 15): a phase banner, and the buy panels only while farming. */
  arena?: boolean;
  /**
   * The side this HUD plays (default the player's). Online the guest plays
   * the enemy side; its own panel stays top left, the opponent top right.
   */
  side?: Side;
  /**
   * Online (lockstep) match: the opponent's name for the top-right panel,
   * and no pause or speed buttons (one battle for two people).
   */
  online?: { opponent: string };
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
  /** Show the age-up banner for this age once rebuilt (not after a keybinding change). */
  announceAge?: number;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}


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
const TAB_WIDTH = 92;
const TAB_HEIGHT = 26;

export type TabKey = 'units' | 'turrets' | 'buildings' | 'research';
const TAB_ORDER: readonly TabKey[] = ['units', 'turrets', 'buildings', 'research'];

/**
 * The HUD, run as a separate scene on top of `GameScene`: age, gold, the XP
 * bar, the age-up button and both base HP bars at the top; at the bottom a panel with a Units
 * tab (buy units, training queue), a Turrets tab (unlock slots, build and
 * sell turrets), Buildings, Research, and a Hangar button (the full-screen
 * hangar where you design and build the Mech), plus the special attack button on its right. Click a tab or
 * use its key to switch.
 *
 * Keyboard (owner, 2026-09-27: fully playable by keyboard, every key
 * rebindable): a `KeyboardControls` turns the keymap's battle actions into
 * button presses. Slot keys act on the open tab (buy a unit, choose a
 * turret slot, upgrade a building, research a track; Shift / Ctrl pass on
 * for multi-buys), the army keys queue a saved composition, and a hint line
 * next to the tabs shows the open tab's keys. Keys do nothing while the
 * match isn't being played.
 *
 * It reads the match state once when it starts; after that every change
 * arrives as an event, so it never polls the state per frame. (On
 * `turret-built` it looks up the new turret's state once, for its refund.)
 *
 * Listens for: `gold-changed`, `xp-changed`, `base-damaged`,
 * `unit-queue-changed`, `age-changed`, `slot-unlocked`, `turret-built`,
 * `turret-upgraded`, `turret-sold`, `special-cooldown-changed`, `economy-changed` (filtered to
 * the relevant side)
 * `match-state-changed` (buttons lock unless the match is playing),
 * `mech-changed` and `keybindings-changed` (rebuilds with the new key labels).
 * Emits (through its panels and buttons): `buy-unit-requested`,
 * `buy-slot-requested`, `buy-turret-requested`, `upgrade-turret-requested`,
 * `sell-turret-requested`, `special-requested`, `age-up-requested`,
 * `build-mech-requested`.
 */
export class HUDScene extends Phaser.Scene {
  private state!: MatchState;
  private cleanups: (() => void)[] = [];
  /** The army hotkey last pressed, until `army-queued` says how it went. */
  private pendingArmy: number | null = null;
  private ageText!: Phaser.GameObjects.Text;
  private enemyAgeText!: Phaser.GameObjects.Text;
  /** Who plays the enemy (difficulty, profile), right of the enemy's age. */
  private enemyControllerText!: Phaser.GameObjects.Text;
  /** Conquest siege notice (created on the first `siege-changed`). */
  private siegeText: Phaser.GameObjects.Text | null = null;
  /** Catch-up notices (switch `ageCatchUp`) under the two top panels. */
  private catchUpTexts!: Record<Side, Phaser.GameObjects.Text>;
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
  /** Opens the hangar (the Mech): a button in the tab row, not a tab. */
  private hangarButton!: UiButton;
  private bottomPanel!: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;
  /** Mech Arena: the phase now (null outside the arena). */
  private arenaPhase: ArenaPhase | null = null;
  private hangarLabel!: Phaser.GameObjects.Text;
  /** The utility Mech's building and whether it works there (last seen). */
  private assistKey = '';
  private speedButton!: UiButton;
  private speedText!: Phaser.GameObjects.Text;
  private speed = 1;
  private backgroundText!: Phaser.GameObjects.Text;
  private backgroundName = '';
  private lastEconomy = { units: 0, incomePerSec: 0, damageMult: 1, speedMult: 1 };
  private specialButton!: SpecialButton;
  private ageUpButton!: AgeUpButton;
  private pauseButton!: UiButton;
  /** Prototype HUD parts (features.config), null when switched off. */
  private warCryButton: WarCryButton | null = null;
  /** The Mech's Special module: takes the War cry's place while a Mech with one is out. */
  private mechAbilityButton!: MechAbilityButton;
  private doctrinePopup: DoctrinePopup | null = null;
  private tabs!: Record<TabKey, UiButton>;
  private activeTab: TabKey = 'units';
  private keys!: KeyboardControls;
  private locked = false;
  /** The open tab's keys, next to the tabs; army results flash here too. */
  private tabHint!: Phaser.GameObjects.Text;
  private hintFlash: Phaser.Time.TimerEvent | null = null;
  private data0!: HudSceneData;
  /** The side this HUD plays, and the other one (only shown as age and base HP). */
  private side: Side = 'player';
  private foe: Side = 'enemy';
  private lastSpecial = { remainingMs: 0, totalMs: 1 };

  constructor() {
    super({ key: SCENE_KEYS.hud });
  }

  init(data: HudSceneData): void {
    this.data0 = data;
    this.side = data.side ?? 'player';
    this.foe = otherSide(this.side);
    this.state = data.state;
    this.enemyController = data.enemyController;
    this.backgroundName = data.backgroundName;
    this.cleanups = [];
    this.activeTab = data.restore?.tab ?? 'units';
    this.lastSpecial = data.restore?.special ?? { remainingMs: 0, totalMs: 1 };
  }

  create(): void {
    this.pendingArmy = null;
    const own = this.state[this.side];
    // The HUD wears the player's age (palette, pattern, trim).
    applyUiTheme(own.age);
    this.baseBars = { [this.side]: this.buildTopLeft(), [this.foe]: this.buildTopRight() } as Record<Side, HudBar>;
    this.buildCatchUpNotices();
    this.ageUpButton = new AgeUpButton(
      this,
      this.side,
      MARGIN + TOP_PANEL_WIDTH + 8 + AGE_UP_WIDTH / 2,
      12 + TOP_LEFT_HEIGHT / 2,
      AGE_UP_WIDTH,
      TOP_LEFT_HEIGHT,
      own.age,
      own.xp,
      own.maxAge,
    );

    this.bottomPanel = addThemedPanel(this, PANEL_LEFT + PANEL_WIDTH / 2, PANEL_TOP + PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, { alpha: 0.96 });
    this.unitPanel = new UnitBuyPanel(this, this.side, PANEL_LEFT, PANEL_TOP, {
      gold: own.gold,
      age: own.age,
      queue: own.trainingQueue,
      traits: own.traits,
    });
    this.turretPanel = new TurretPanel(this, this.side, PANEL_LEFT, PANEL_TOP, {
      gold: own.gold,
      age: own.age,
      unlockedSlots: own.unlockedSlots,
      turrets: own.turrets,
    });
    this.buildingPanel = new BuildingPanel(this, this.side, own, PANEL_LEFT, PANEL_TOP);
    this.researchPanel = new ResearchPanel(this, this.side, own, PANEL_LEFT, PANEL_TOP);
    this.specialButton = new SpecialButton(
      this,
      this.side,
      PANEL_LEFT + PANEL_WIDTH + SIDE_GAP + SIDE_BUTTON_SIZE / 2,
      PANEL_TOP + PANEL_HEIGHT / 2,
      SIDE_BUTTON_SIZE,
      own.age,
    );
    this.warCryButton = feature('warCry')
      ? new WarCryButton(this, this.side, PANEL_LEFT + PANEL_WIDTH + SIDE_GAP * 2 + SIDE_BUTTON_SIZE + 48, PANEL_TOP + PANEL_HEIGHT / 2, 96)
      : null;
    this.mechAbilityButton = new MechAbilityButton(
      this,
      this.side,
      PANEL_LEFT + PANEL_WIDTH + SIDE_GAP * 2 + SIDE_BUTTON_SIZE + 48,
      PANEL_TOP + PANEL_HEIGHT / 2,
      96,
      (shown) => this.warCryButton?.setVisible(!shown),
    );
    this.doctrinePopup = feature('ageDoctrines') ? new DoctrinePopup(this, this.side) : null;
    this.tabs = {
      units: this.buildTab(0, 'Units', 'units'),
      turrets: this.buildTab(1, 'Turrets', 'turrets'),
      buildings: this.buildTab(2, 'Buildings', 'buildings'),
      research: this.buildTab(3, 'Research', 'research'),
    };
    this.buildHangarButton(4);
    this.tabHint = this.add
      .text(PANEL_LEFT + 12 + (TAB_ORDER.length + 1) * (TAB_WIDTH + 6) + 6, PANEL_TOP - TAB_HEIGHT / 2 + 2, '', {
        fontFamily: UI_FONT,
        fontSize: '12px',
        fontStyle: '600',
        color: UiTextColors.parchment,
        stroke: UiTextColors.stroke,
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5);
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
    // Playtest: cycle the background options (also a key, Y by default).
    const backgroundButton = new UiButton(this, GAME_WIDTH / 2 + 54 + 26 + 8 + 75, 34, 150, 40, {
      onPress: () => emit(Events.BackgroundCycleRequested, {}),
      tint: UiColors.panelDark,
    });
    this.backgroundText = this.add
      .text(0, 0, '', { fontFamily: UI_FONT, fontSize: '11px', color: UiTextColors.parchment })
      .setOrigin(0.5);
    backgroundButton.add(this.backgroundText);
    this.showBackgroundName(this.backgroundName);
    if (this.data0.online) {
      // One battle for two people: nobody pauses or speeds it up.
      this.pauseButton.container.setVisible(false);
      this.speedButton.container.setVisible(false);
      this.buildOnlineBanner();
    }
    if (this.data0.arena) this.buildArena();
    this.keys = new KeyboardControls(this, () => this.keyContexts());
    this.bindKeys();
    this.setLocked(this.state.phase !== 'playing');

    // Carried over a re-skin: speed, money-unit economy, special cooldown.
    const restore = this.data0.restore;
    if (restore) {
      this.speed = restore.speed;
      this.speedText.setText(`${restore.speed}x`).setColor(restore.speed === 1 ? UiTextColors.parchment : UiTextColors.gold);
      this.lastEconomy = { ...restore.economy };
      this.refreshIncome();
      if (restore.announceAge !== undefined) this.announceAge(restore.announceAge);
    }
    this.specialButton.setCooldown(this.lastSpecial.remainingMs, this.lastSpecial.totalMs);

    // One-time read of the starting values; events keep them current.
    this.showAge(own.age);
    this.showGold(own.gold);
    this.showXp(own.xp, xpToNextAge(this.state, this.side));
    for (const side of [this.side, this.foe]) this.showBaseHp(side, this.state[side].baseHp, baseMaxHp(this.state[side].age));

    this.cleanups.push(
      on(Events.GoldChanged, ({ side, gold }) => {
        if (side === this.side) this.showGold(gold);
      }),
      on(Events.XpChanged, ({ side, xp, xpToNext }) => {
        if (side !== this.side) return;
        this.showXp(xp, xpToNext);
        this.ageUpButton.setXp(xp);
      }),
      on(Events.BaseDamaged, ({ side, hp, maxHp }) => this.showBaseHp(side, hp, maxHp)),
      on(Events.ArmyQueued, (payload) => this.showArmyQueued(payload)),
      on(Events.UnitQueueChanged, ({ side, queue }) => {
        if (side === this.side) this.unitPanel.setQueue(queue);
      }),
      on(Events.AgeChanged, ({ side, age }) => {
        this.showBaseHp(side, this.state[side].baseHp, baseMaxHp(age));
        if (side !== this.side) {
          this.showEnemyAge(age);
          this.showCatchUp();
          this.announceEnemyAge(age);
          return;
        }
        // Rebuild in the new age's look (it reads everything else back
        // from the match state), then show the age-up banner.
        this.scene.restart({
          ...this.data0,
          backgroundName: this.backgroundName,
          restore: { ...this.restoreState(), announceAge: age },
        } satisfies HudSceneData);
      }),
      on(Events.SiegeChanged, ({ mult }) => this.showSiege(mult)),
      on(Events.SpecialCooldownChanged, ({ side, remainingMs, totalMs }) => {
        if (side !== this.side) return;
        this.lastSpecial = { remainingMs, totalMs };
        this.specialButton.setCooldown(remainingMs, totalMs);
      }),
      on(Events.SlotUnlocked, ({ side, slotIndex }) => {
        if (side === this.side) this.turretPanel.setUnlockedSlots(slotIndex + 1);
      }),
      on(Events.TurretBuilt, ({ side, slotIndex }) => {
        if (side === this.side) this.turretPanel.setTurret(slotIndex, this.state[side].turrets[slotIndex] ?? null);
      }),
      on(Events.TurretUpgraded, ({ side, slotIndex }) => {
        if (side === this.side) this.turretPanel.setTurret(slotIndex, this.state[side].turrets[slotIndex] ?? null);
      }),
      on(Events.TurretSold, ({ side, slotIndex }) => {
        if (side === this.side) this.turretPanel.setTurret(slotIndex, null);
      }),
      on(Events.EconomyChanged, ({ side, economyUnits, incomePerSec, damageMult, speedMult }) => {
        if (side !== this.side) return;
        this.lastEconomy = { units: economyUnits, incomePerSec, damageMult, speedMult };
        this.refreshIncome();
      }),
      on(Events.BuildingUpgraded, ({ side }) => {
        if (side !== this.side) return;
        this.buildingPanel.rebuild();
        this.researchPanel.rebuild();
        this.refreshIncome();
      }),
      on(Events.MechChanged, ({ side, alive, build }) => {
        if (side === this.side) this.showMech(alive, build);
      }),
      // A utility Mech at a building: its time left on the hangar button; that building's prices change.
      on(Events.MechAssistChanged, ({ side, buildingId, working, remainingMs }) => {
        if (side !== this.side) return;
        const label = buildingId ? `${working ? 'Works' : 'Mech'} ${Math.ceil(remainingMs / 1000)}s` : 'Hangar';
        if (this.hangarLabel.text !== label) this.hangarLabel.setText(label);
        // Prices change when it arrives, leaves or moves on: redraw the cards then.
        const key = `${buildingId}:${working}`;
        if (key !== this.assistKey) {
          this.assistKey = key;
          this.buildingPanel.rebuild();
          this.researchPanel.rebuild();
          this.refreshIncome();
        }
      }),
      on(Events.BaseRepaired, ({ side, hp, maxHp }) => this.showBaseHp(side, hp, maxHp)),
      on(Events.ResearchCompleted, ({ side }) => {
        if (side === this.side) this.researchPanel.rebuild();
      }),
      on(Events.BuildingPerkChosen, ({ side }) => {
        if (side !== this.side) return;
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
      on(Events.KeybindingsChanged, () => this.scene.restart({ ...this.data0, backgroundName: this.backgroundName, restore: this.restoreState() })),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  /** What a rebuilt HUD can't read back from the match state. */
  private restoreState(): HudRestore {
    return { tab: this.activeTab, speed: this.speed, economy: { ...this.lastEconomy }, special: { ...this.lastSpecial } };
  }

  /** Live key contexts, most important first; none while the match isn't being played. */
  private keyContexts(): readonly KeyContext[] {
    // The hangar has its own keys while it is open.
    if (this.locked || this.scene.isActive(SCENE_KEYS.hangar)) return [];
    const popup = this.buildingPanel.perkChoiceOpen || (this.doctrinePopup?.isOpen ?? false);
    return popup ? ['popup', this.activeTab, 'battle'] : [this.activeTab, 'battle'];
  }

  private bindKeys(): void {
    const k = this.keys;
    const step = (by: number): TabKey => TAB_ORDER[(TAB_ORDER.indexOf(this.activeTab) + by + TAB_ORDER.length) % TAB_ORDER.length] ?? 'units';
    k.on('tab-next', () => this.showTab(step(1)));
    k.on('tab-prev', () => this.showTab(step(-1)));
    k.on('tab-units', () => this.showTab('units'));
    k.on('tab-turrets', () => this.showTab('turrets'));
    k.on('tab-buildings', () => this.showTab('buildings'));
    k.on('tab-research', () => this.showTab('research'));
    k.on('tab-workshop', () => this.openHangar());
    for (let n = 1; n <= 10; n++) k.on(`slot-${n}`, (modifiers) => this.pressSlot(n, modifiers));
    k.on('turret-build-1', () => this.turretPanel.build(0));
    k.on('turret-build-2', () => this.turretPanel.build(1));
    k.on('turret-build-3', () => this.turretPanel.build(2));
    k.on('turret-upgrade', () => this.turretPanel.upgrade());
    k.on('turret-sell', () => this.turretPanel.sell());
    k.on('age-up', () => this.ageUpButton.press());
    k.on('special', () => this.specialButton.press());
    k.on('war-cry', () => (this.mechAbilityButton.press() ? true : this.warCryButton ? this.warCryButton.press() : false));
    for (let n = 1; n <= ARMY_COUNT; n++) {
      k.on(`army-${n}`, () => this.queueArmy(n - 1));
      k.on(`army-save-${n}`, () => this.saveArmy(n - 1));
    }
    (['choice-1', 'choice-2', 'choice-3'] as const).forEach((id, i) =>
      k.on(id, () => (this.buildingPanel.perkChoiceOpen ? this.buildingPanel.pickPerk(i) : (this.doctrinePopup?.pick(i) ?? false))),
    );
  }

  /** A slot key on the open tab. False when the tab has no such slot (the key stays free). */
  private pressSlot(slot: number, modifiers: PressModifiers): boolean {
    switch (this.activeTab) {
      case 'units':
        return this.unitPanel.pressSlot(slot, modifiers);
      case 'turrets':
        return this.turretPanel.select(slot - 1);
      case 'buildings': {
        const id = activeBuildingIds()[slot - 1];
        if (!id) return false;
        this.buildingPanel.press(id, modifiers);
        return true;
      }
      case 'research': {
        const track = RESEARCH[slot - 1];
        if (!track) return false;
        this.researchPanel.press(track.id, modifiers);
        return true;
      }
    }
  }

  /** Queues army `index` (stops at the first unit it can't afford or a full queue) and says how it went. */
  private queueArmy(index: number): void {
    const army = getArmy(index);
    if (army.length === 0) {
      this.flashHint(`Army ${index + 1} is empty: set it up under Controls (pause menu)`, '#f0c080');
      return;
    }
    this.pendingArmy = index;
    emit(Events.QueueArmyRequested, { side: this.side, army });
  }

  /**
   * Mech Arena: a banner with the round, phase, time left and score; the buy
   * panels only while farming; round results and raider leaks as messages.
   */
  private buildArena(): void {
    this.specialButton.setVisible(false);
    this.ageUpButton.setVisible(false);
    const banner = this.add
      .text(GAME_WIDTH / 2, 128, '', {
        fontFamily: UI_TITLE_FONT,
        fontSize: '22px',
        color: UiTextColors.title,
        stroke: UiTextColors.stroke,
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(40);
    const result = this.add
      .text(GAME_WIDTH / 2, 300, '', {
        fontFamily: UI_TITLE_FONT,
        fontSize: '46px',
        color: UiTextColors.gold,
        stroke: UiTextColors.stroke,
        strokeThickness: 8,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(45)
      .setVisible(false);
    const clock = (ms: number): string => {
      const s = Math.ceil(ms / GAME_SPEED / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    const foeName = this.data0.online ? 'Opponent' : 'Enemy';
    this.cleanups.push(
      on(Events.ArenaChanged, ({ phase, round, wins, remainingMs, picked }) => {
        const score = `You ${wins[this.side]} - ${wins[this.foe]} ${foeName}`;
        const lines: Record<ArenaPhase, string> = {
          farm: `Round ${round} · FARM ${clock(remainingMs)} · ${score}\nKill the raiders for gold, then build a Mech`,
          hangar: `Round ${round} · HANGAR ${clock(remainingMs)} · ${score}\n${picked[this.side] ? 'Your Mech is ready' : 'Build your Mech (B opens the hangar)'}${picked[this.foe] ? ` · ${foeName} is ready` : ''}`,
          fight: `Round ${round} · FIGHT ${clock(remainingMs)} · ${score}`,
          'round-over': `Round ${round} · ${score}`,
        };
        banner.setText(lines[phase]);
        if (phase !== this.arenaPhase) {
          this.arenaPhase = phase;
          this.setArenaLayout(phase);
          if (phase === 'farm') result.setVisible(false);
        }
      }),
      on(Events.ArenaRoundEnded, ({ round, winner, matchOver }) => {
        const text =
          winner === null ? `Round ${round}: no winner\n(no Mech on the lane)` : winner === this.side ? `Round ${round}: you win!` : `Round ${round}: ${foeName.toLowerCase()} wins`;
        result.setText(matchOver ? '' : text).setVisible(!matchOver);
      }),
      on(Events.RaiderLeaked, ({ side, amount }) => {
        if (side === this.side && amount > 0) this.flashHint(`A raider got through: -${Math.round(amount)} gold`, '#f08a80');
      }),
    );
  }

  /** Arena layout: buying while farming; only the bars and the Mech's module otherwise. */
  private setArenaLayout(phase: ArenaPhase): void {
    const farming = phase === 'farm';
    this.bottomPanel.setVisible(farming);
    for (const tab of TAB_ORDER) this.tabs[tab].container.setVisible(farming);
    this.tabHint.setVisible(farming);
    this.hangarButton.container.setVisible(phase === 'hangar' || farming);
    if (farming) this.showTab(this.activeTab, false);
    else for (const panel of [this.unitPanel, this.turretPanel, this.buildingPanel, this.researchPanel]) panel.setVisible(false);
  }

  /** Online: a line under the top bar while the battle waits on a player or a connection. */
  private buildOnlineBanner(): void {
    // Below the Mech Arena's round banner when there is one.
    const banner = this.add
      .text(GAME_WIDTH / 2, this.data0.arena ? 190 : 92, '', {
        fontFamily: UI_TITLE_FONT,
        fontSize: '22px',
        color: '#ffd27a',
        stroke: UiTextColors.stroke,
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.cleanups.push(
      on(Events.OnlineStatusChanged, ({ status, secondsLeft }) => {
        const text: Record<typeof status, string> = {
          ok: '',
          waiting: 'Waiting for your opponent...',
          'opponent-left': `Your opponent lost their connection\nWaiting ${secondsLeft} s for them to come back`,
          reconnecting: `Connection lost: reconnecting (${secondsLeft} s)`,
        };
        banner.setText(text[status]);
      }),
    );
  }

  /** `army-queued`: says how the army last asked for went. */
  private showArmyQueued({ side, queued, wanted, stoppedBy }: EventPayloads[typeof Events.ArmyQueued]): void {
    if (side !== this.side || this.pendingArmy === null) return;
    const why = stoppedBy === 'gold' ? ' (not enough gold)' : stoppedBy === 'queue' ? ' (queue full)' : '';
    this.flashHint(`Army ${this.pendingArmy + 1}: ${queued} of ${wanted} queued${why}`, stoppedBy ? '#f0c080' : '#8fe08f');
    this.pendingArmy = null;
  }

  /** Saves what is training now as army `index`. */
  private saveArmy(index: number): void {
    const army = armyFromQueue(this.state[this.side]);
    if (army.length === 0) {
      this.flashHint('Nothing in training to save', '#f0c080');
      return;
    }
    setArmy(index, army);
    this.flashHint(`Army ${index + 1} saved: ${armyLabel(army)}`, '#8fe08f');
  }

  /** The open tab's keys, from the keymap. */
  private tabKeysText(tab: TabKey): string {
    const range = (from: KeyActionId, to: KeyActionId): string => {
      const a = keyHint(from);
      const b = keyHint(to);
      return a && b ? `${a}-${b}` : a || b;
    };
    const armies = range('army-1', `army-${ARMY_COUNT}`);
    switch (tab) {
      case 'units':
        return `${range('slot-1', 'slot-5')} buy  ·  ${armies} armies`;
      case 'turrets':
        return `${range('slot-1', 'slot-5')} choose slot  ·  ${[keyHint('turret-build-1'), keyHint('turret-build-2'), keyHint('turret-build-3')].join(' ')} build  ·  ${keyHint('turret-upgrade')} upgrade  ·  ${keyHint('turret-sell')} sell`;
      case 'buildings':
        return `${range('slot-1', `slot-${Math.min(10, activeBuildingIds().length)}`)} upgrade  ·  Shift: to stage end  ·  Ctrl: max`;
      case 'research':
        return `${range('slot-1', `slot-${Math.min(10, RESEARCH.length)}`)} research  ·  Shift: every open tier`;
    }
  }

  /** Shows a message on the hint line for a moment, then the tab's keys again. */
  private flashHint(text: string, color: string): void {
    this.hintFlash?.remove();
    this.tabHint.setText(text).setColor(color);
    this.hintFlash = this.time.delayedCall(2600, () => {
      this.hintFlash = null;
      this.tabHint.setText(this.tabKeysText(this.activeTab)).setColor(UiTextColors.parchment);
    });
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
    const controller = this.data0.online
      ? this.data0.online.opponent
      : this.enemyController === 'off'
        ? 'No AI'
        : `${capitalize(this.enemyController)} AI${profile}`;
    this.enemyControllerText = this.add
      .text(left + TOP_PANEL_WIDTH - 16, top + 22, controller, { fontFamily: UI_FONT, fontSize: '14px', color: UiTextColors.dim })
      .setOrigin(1, 0.5);
    this.label(left + 16, top + 52, 'Base');
    const barLeft = left + BAR_LEFT_OFFSET;
    const barWidth = TOP_PANEL_WIDTH - BAR_LEFT_OFFSET - 16;
    this.showEnemyAge(this.state[this.foe].age);
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
    tab.add(
      this.add.text(0, 0, text, { fontFamily: UI_FONT, fontSize: '14px', fontStyle: '600', color: UiTextColors.parchment }).setOrigin(0.5),
      this.add
        .text(TAB_WIDTH / 2 - 6, 0, keyHint(`tab-${key}`), { fontFamily: UI_FONT, fontSize: '10px', color: UiTextColors.dim })
        .setOrigin(1, 0.5),
    );
    return tab;
  }

  /** The Workshop button beside the tabs: opens the hangar, and shows the Mech's build. */
  private buildHangarButton(index: number): void {
    const x = PANEL_LEFT + 12 + TAB_WIDTH / 2 + index * (TAB_WIDTH + 6);
    const y = PANEL_TOP - TAB_HEIGHT / 2 + 2;
    this.hangarButton = new UiButton(this, x, y, TAB_WIDTH, TAB_HEIGHT, {
      onPress: () => this.openHangar(),
      tint: UiColors.ready,
      hoverTint: UiColors.panelHover,
    });
    this.hangarLabel = this.add
      .text(0, 0, 'Hangar', { fontFamily: UI_FONT, fontSize: '14px', fontStyle: '600', color: UiTextColors.parchment })
      .setOrigin(0.5);
    this.hangarButton.add(
      this.hangarLabel,
      this.add
        .text(TAB_WIDTH / 2 - 6, 0, keyHint('tab-workshop'), { fontFamily: UI_FONT, fontSize: '10px', color: UiTextColors.dim })
        .setOrigin(1, 0.5),
    );
    const mech = this.state[this.side].mech;
    this.showMech(mech.alive, mech.build);
  }

  /** The hangar button's label: the build's seconds left while one runs. */
  private showMech(alive: boolean, build: { remainingMs: number } | null): void {
    const label = build ? (build.remainingMs > 0 ? `Mech ${Math.ceil(build.remainingMs / 1000)}s` : 'Mech ready') : alive ? 'Mech out' : 'Hangar';
    if (this.hangarLabel.text !== label) this.hangarLabel.setText(label);
  }

  /** Full-screen Mech hangar over the battle (Mech expansion); B again or Esc closes it. */
  private openHangar(): void {
    if (this.locked || this.scene.isActive(SCENE_KEYS.hangar)) return;
    if (this.arenaPhase !== null && this.arenaPhase !== 'hangar') {
      this.flashHint('The hangar opens when the farm is over', '#f0c080');
      return;
    }
    this.scene.launch(SCENE_KEYS.hangar, { state: this.state, side: this.side } satisfies HangarSceneData);
  }

  private showTab(key: TabKey, moveCamera = true): void {
    this.activeTab = key;
    this.unitPanel.setVisible(key === 'units');
    this.turretPanel.setVisible(key === 'turrets');
    this.buildingPanel.setVisible(key === 'buildings');
    this.researchPanel.setVisible(key === 'research');
    for (const tab of TAB_ORDER) this.tabs[tab].setSelected(key === tab);
    if (!this.hintFlash) this.tabHint.setText(this.tabKeysText(key)).setColor(UiTextColors.parchment);
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
    this.locked = locked;
    this.unitPanel.setLocked(locked);
    this.turretPanel.setLocked(locked);
    this.buildingPanel.setLocked(locked);
    this.researchPanel.setLocked(locked);
    this.hangarButton.setEnabled(!locked);
    this.speedButton.setEnabled(!locked);
    this.specialButton.setLocked(locked);
    this.ageUpButton.setLocked(locked);
    this.pauseButton.setEnabled(!locked);
    this.warCryButton?.setLocked(locked);
    this.mechAbilityButton.setLocked(locked);
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

  /** Conquest siege: a red line under the top buttons once units hit harder. */
  private showSiege(mult: number): void {
    const text = `Siege! All units +${Math.round((mult - 1) * 100)}% damage`;
    if (!this.siegeText || !this.siegeText.active) {
      this.siegeText = this.add
        .text(GAME_WIDTH / 2, 70, '', {
          fontFamily: UI_FONT,
          fontSize: '15px',
          fontStyle: '600',
          color: '#ff9a7a',
          stroke: UiTextColors.stroke,
          strokeThickness: 4,
        })
        .setOrigin(0.5, 0);
    }
    this.siegeText.setText(text);
    this.tweens.add({ targets: this.siegeText, scale: { from: 1.3, to: 1 }, duration: 300, ease: 'Back.easeOut' });
  }

  /** Small ribbons under the top panels while a side is behind in age (catch-up rules). */
  private buildCatchUpNotices(): void {
    const style = (color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: UI_FONT,
      fontSize: '13px',
      fontStyle: '600',
      color,
      stroke: UiTextColors.stroke,
      strokeThickness: 3,
    });
    this.catchUpTexts = {
      [this.side]: this.add.text(MARGIN + 12, 12 + TOP_LEFT_HEIGHT + 8, '', style('#ffd27a')),
      [this.foe]: this.add.text(GAME_WIDTH - MARGIN - 12, 12 + 74 + 8, '', style(UiTextColors.dim)).setOrigin(1, 0),
    } as Record<Side, Phaser.GameObjects.Text>;
    this.showCatchUp();
  }

  private showCatchUp(): void {
    const player = ageGap(this.state, this.side);
    const enemy = ageGap(this.state, this.foe);
    this.catchUpTexts[this.side].setText(
      player > 0
        ? `Behind in age: +${Math.round(AGE_CATCH_UP.killXpPerAge * player * 100)}% kill XP, turrets +${Math.round(AGE_CATCH_UP.turretDamagePerAge * player * 100)}%`
        : '',
    );
    this.catchUpTexts[this.foe].setText(enemy > 0 ? 'Behind in age: catching up' : '');
  }

  private showEnemyAge(age: number): void {
    this.enemyAgeText.setText(`${this.data0.online ? 'Opponent' : 'Enemy'} · ${getAge(age).name} Age`);
    // Long labels (Renaissance, Conquest battles) shrink to fit beside the age.
    const room = TOP_PANEL_WIDTH - 32 - 12 - this.enemyAgeText.width;
    const label = this.enemyControllerText;
    label.setScale(1);
    if (label.width > room) label.setScale(Math.max(0.55, room / label.width));
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
    const mine = mineGoldPerSec(this.state[this.side]);
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
    this.warCryButton?.destroy();
    this.mechAbilityButton.destroy();
    this.warCryButton = null;
    this.doctrinePopup?.destroy();
    this.doctrinePopup = null;
  }
}
