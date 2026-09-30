import Phaser from 'phaser';
import { AGE_NAMES } from '@config/ages.config';
import {
  activeBuildingIds,
  BUILDING_OUTPUT,
  BUILDING_PERKS,
  BUILDINGS,
  LEVELS_PER_AGE,
  maxBuildingLevel,
  perksPending,
  type BuildingId,
  type PerkChoice,
} from '@config/buildings.config';
import type { SideState } from '@state/GameState';
import type { Side } from '@state/types';
import {
  buildingEffects,
  buildingPrice,
  buildingRejection,
  libraryXpPerSec,
  marketXpPerSec,
  mineGoldPerSec,
} from '@systems/BuildingSystem';
import { addPanel, addThemedPanel, UI_FONT, UI_TITLE_FONT, UiColors, UiTextColors, UiTextures } from '@ui/kenneyUi';
import { keyHint } from '@ui/keymap';
import { UiButton, type PressModifiers } from '@ui/UiButton';
import { UnitBuyPanel } from '@ui/UnitBuyPanel';
import { emit, Events } from '@utils/EventBus';

const PADDING = 10;
const GAP = 8;
const CARD_HEIGHT = UnitBuyPanel.HEIGHT - PADDING * 2;

function textStyle(size: number, color: string, weight = '500'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: UI_FONT, fontSize: `${size}px`, color, fontStyle: weight };
}

interface Card {
  container: Phaser.GameObjects.Container;
  button: UiButton;
  perk: boolean;
}

const pct = (mult: number): string => `${Math.round(Math.abs(1 - mult) * 100)}%`;

/**
 * HUD tab for the buildings behind the base (Phase 14; reworked 2026-09-26):
 * one card per building with its level (five per age, pips for the levels
 * of the current stage), what it gives now and an Upgrade button. When a
 * perk is waiting (prototype, every fifth level), the button turns into
 * "Pick perk", which opens a choice between the building's two perks.
 * Shift buys levels up to the end of the stage, Ctrl (Cmd) as many as the
 * gold and the age allow (owner, 2026-09-27: "tired spam clicking"); each
 * level is still its own request, and it stops at the first refusal or a
 * perk to pick. Presses only emit `upgrade-building-requested` /
 * `choose-perk-requested`.
 */
export class BuildingPanel {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly side: Side;
  private readonly sideState: SideState;
  private readonly left: number;
  private readonly top: number;
  private readonly cards = new Map<BuildingId, Card>();
  private popup: Phaser.GameObjects.Container | null = null;
  /** The open perk choice's two buttons (keyboard). */
  private perkPicks: UiButton[] = [];
  private locked = false;

  constructor(scene: Phaser.Scene, side: Side, sideState: SideState, left: number, top: number) {
    this.scene = scene;
    this.side = side;
    this.sideState = sideState;
    this.left = left;
    this.top = top;
    this.root = scene.add.container(0, 0);
    this.rebuild();
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
    if (!visible) this.closePopup();
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.refreshButtons();
  }

  /** Levels, perks or age changed: redraw the cards. */
  rebuild(): void {
    const ids = activeBuildingIds();
    ids.forEach((id, index) => this.buildCard(id, index, ids.length));
    this.refreshButtons();
  }

  /** Gold changed: only the buttons' enabled state can change. */
  refreshButtons(): void {
    for (const [id, card] of this.cards) {
      const enabled = card.perk || buildingRejection(this.sideState, id) === null;
      card.button.setEnabled(!this.locked && enabled);
    }
  }

  private buildCard(id: BuildingId, index: number, count: number): void {
    this.cards.get(id)?.container.destroy();
    const width = (UnitBuyPanel.WIDTH - PADDING * 2 - GAP * (count - 1)) / count;
    const def = BUILDINGS[id];
    const me = this.sideState;
    const level = me.buildings[id];
    const x0 = this.left + PADDING + index * (width + GAP);
    const y0 = this.top + PADDING;
    const container = this.scene.add.container(x0, y0);
    this.root.add(container);

    const pips = this.scene.add.graphics();
    const inStage = level > 0 ? ((level - 1) % LEVELS_PER_AGE) + 1 : 0;
    for (let i = 0; i < LEVELS_PER_AGE; i++) {
      const x = 10 + i * 9;
      pips.fillStyle(i < inStage ? UiColors.gold : 0x000000, i < inStage ? 1 : 0.45);
      pips.fillCircle(x, 30, 3.2);
    }
    container.add([
      addPanel(this.scene, UiTextures.panel, width / 2, CARD_HEIGHT / 2, width, CARD_HEIGHT, UiColors.panelMid),
      this.scene.add.text(7, 4, def.name, { fontFamily: UI_TITLE_FONT, fontSize: '15px', color: UiTextColors.parchment }),
      this.scene.add
        .text(width - 7, 6, level > 0 ? `L${level}/${maxBuildingLevel(me.age)}` : '', textStyle(11, UiTextColors.dim, '600'))
        .setOrigin(1, 0),
      pips,
      this.scene.add.text(width - 7, 22, keyHint(`slot-${index + 1}`), textStyle(11, UiTextColors.dim, '600')).setOrigin(1, 0),
      this.scene.add
        .text(7, 38, this.effectText(id, level), {
          ...textStyle(11, level > 0 ? UiTextColors.gold : UiTextColors.dim, '600'),
          wordWrap: { width: width - 12 },
          lineSpacing: -1,
        }),
    ]);

    const pending = perksPending(level, me.buildingPerks[id].length) > 0;
    const button = new UiButton(this.scene, width / 2, CARD_HEIGHT - 16, width - 10, 24, {
      onPress: (modifiers) => (pending ? this.openPerkChoice(id) : this.buyLevels(id, modifiers)),
      tint: pending ? UiColors.ready : UiColors.panelDark,
    });
    const cost = buildingPrice(this.sideState, id);
    const rejection = buildingRejection(me, id);
    if (pending) {
      const t = this.scene.add.text(0, 0, 'Pick perk!', { fontFamily: UI_TITLE_FONT, fontSize: '14px', color: '#fff6de' }).setOrigin(0.5);
      button.add(t);
      this.scene.tweens.add({ targets: t, scale: 1.1, duration: 450, yoyo: true, repeat: -1 });
    } else if (cost === null) {
      button.add(this.scene.add.text(0, 0, 'Max level', textStyle(11, UiTextColors.dim)).setOrigin(0.5));
    } else if (rejection === 'closed') {
      button.add(this.scene.add.text(0, 0, 'Closed', textStyle(11, '#f08a80')).setOrigin(0.5));
    } else if (rejection === 'age-locked') {
      button.add(this.scene.add.text(0, 0, `${AGE_NAMES[me.age + 1] ?? ''} Age`, textStyle(11, UiTextColors.dim)).setOrigin(0.5));
    } else {
      button.add(
        this.scene.add.text(-width / 2 + 12, 0, level === 0 ? 'Build' : 'Up', textStyle(12, UiTextColors.parchment, '600')).setOrigin(0, 0.5),
        this.priceLabel(width / 2 - 12, 0, cost),
      );
    }
    container.add(button.container);
    this.cards.set(id, { container, button, perk: pending });
  }

  get perkChoiceOpen(): boolean {
    return this.popup !== null;
  }

  /** Keyboard: picks perk `index` (0 or 1) in the open perk choice; false when none is open. */
  pickPerk(index: number): boolean {
    const pick = this.perkPicks[index];
    if (!this.popup || !pick) return false;
    pick.press();
    return true;
  }

  /** Presses a building's card as a click with these modifiers would (keyboard). */
  press(id: BuildingId, modifiers: PressModifiers): void {
    this.cards.get(id)?.button.press(modifiers);
  }

  /** One level, or with Shift up to the stage's end, with Ctrl as many as allowed. */
  private buyLevels(id: BuildingId, modifiers: PressModifiers): void {
    const me = this.sideState;
    const start = me.buildings[id];
    const stageEnd = (Math.floor(start / LEVELS_PER_AGE) + 1) * LEVELS_PER_AGE;
    const wanted = modifiers.ctrl ? Infinity : modifiers.shift ? stageEnd - start : 1;
    for (let bought = 0; bought < wanted; bought++) {
      const before = me.buildings[id];
      emit(Events.UpgradeBuildingRequested, { side: this.side, buildingId: id });
      if (me.buildings[id] === before) return;
      if (perksPending(me.buildings[id], me.buildingPerks[id].length) > 0) return;
    }
  }

  private effectText(id: BuildingId, level: number): string {
    if (level === 0) return BUILDINGS[id].blurb;
    const me = this.sideState;
    const fx = buildingEffects(me);
    const o = BUILDING_OUTPUT;
    switch (id) {
      case 'mine':
        return `+${mineGoldPerSec(me).toFixed(1)} gold/s`;
      case 'library':
        return `+${libraryXpPerSec(me).toFixed(1)} XP/s`;
      case 'forge': {
        const tiers = Math.min(5, Math.floor((level - 1) / LEVELS_PER_AGE) + 1);
        return `Research tier ${tiers}\nUnits +${Math.round(o.forgeDamagePerLevel * level * 100)}% dmg`;
      }
      case 'barracks':
        return `Training -${pct(fx.trainTime)}\nUnits +${Math.round(o.barracksHpPerLevel * level * 100)}% HP`;
      case 'shrine':
        return `Special -${pct(fx.specialCooldown)} cd\n+${pct(fx.specialDamage)} damage`;
      case 'market':
        return `Sells ${marketXpPerSec(me).toFixed(1)} XP/s\nof surplus XP`;
    }
  }

  private priceLabel(right: number, y: number, cost: number): Phaser.GameObjects.Container {
    const text = this.scene.add.text(0, 0, String(cost), textStyle(12, UiTextColors.gold, '600')).setOrigin(1, 0.5);
    const coin = this.scene.add.circle(-text.width - 7, 0, 4, UiColors.gold);
    return this.scene.add.container(right, y, [coin, text]);
  }

  /** A choice between the building's two perks, above the panel. */
  private openPerkChoice(id: BuildingId): void {
    this.closePopup();
    const perks = BUILDING_PERKS[id];
    const width = 520;
    const height = 150;
    const cx = this.left + UnitBuyPanel.WIDTH / 2;
    const cy = this.top - height / 2 - 20;
    const popup = this.scene.add.container(cx, cy).setDepth(40);
    const picks = this.sideState.buildingPerks[id].length;
    popup.add([
      addThemedPanel(this.scene, 0, 0, width, height, { alpha: 0.98 }),
      this.scene.add
        .text(0, -height / 2 + 20, `${BUILDINGS[id].name} perk ${picks + 1}: pick one`, {
          fontFamily: UI_TITLE_FONT,
          fontSize: '20px',
          color: UiTextColors.gold,
          stroke: UiTextColors.stroke,
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    ]);
    (['a', 'b'] as PerkChoice[]).forEach((choice, i) => {
      const perk = perks[choice];
      const owned = this.sideState.buildingPerks[id].filter((c) => c === choice).length;
      const button = new UiButton(this.scene, (i === 0 ? -1 : 1) * 125, 16, 230, 74, {
        onPress: () => {
          emit(Events.ChoosePerkRequested, { side: this.side, buildingId: id, choice });
          this.closePopup();
        },
        framed: true,
      });
      this.perkPicks.push(button);
      button.add(
        this.scene.add.text(-110, -32, keyHint(i === 0 ? 'choice-1' : 'choice-2'), textStyle(11, UiTextColors.dim)),
        this.scene.add
          .text(0, -16, perk.name, { fontFamily: UI_TITLE_FONT, fontSize: '18px', color: UiTextColors.parchment })
          .setOrigin(0.5),
        this.scene.add.text(0, 8, perk.about, textStyle(13, UiTextColors.gold, '600')).setOrigin(0.5),
        this.scene.add.text(0, 26, owned > 0 ? `owned x${owned}` : '', textStyle(11, UiTextColors.dim)).setOrigin(0.5),
      );
      popup.add(button.container);
    });
    const close = new UiButton(this.scene, width / 2 - 22, -height / 2 + 20, 28, 24, { onPress: () => this.closePopup() });
    close.add(this.scene.add.text(0, 0, 'x', textStyle(14, UiTextColors.parchment, '600')).setOrigin(0.5));
    popup.add(close.container);
    this.popup = popup;
  }

  private closePopup(): void {
    this.popup?.destroy();
    this.popup = null;
    this.perkPicks = [];
  }
}
