import Phaser from 'phaser';
import { getAge } from '@config/ages.config';
import { MAX_TURRET_SLOTS } from '@config/constants';
import {
  getTurretDefinition,
  slotUnlockCost,
  turretSellRefund,
  type TurretDefinition,
} from '@entities/turretDefinitions';
import type { TurretState } from '@state/GameState';
import type { Side } from '@state/types';
import { addPanel, fitImage, UI_FONT, UiColors, UiTextColors, UiTextures } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import { emit, Events } from '@utils/EventBus';
import { textureKeyFor } from '@utils/PlaceholderArt';

const PADDING = 12;
const CARD_WIDTH = 144;
const CARD_HEIGHT = 100;
const CARD_GAP = 11;
const MINI_WIDTH = 42;
const MINI_HEIGHT = 66;

export interface TurretPanelInitial {
  gold: number;
  age: number;
  unlockedSlots: number;
  turrets: readonly (TurretState | null)[];
}

/** A button on a card whose availability depends on gold. */
interface PricedButton {
  button: UiButton;
  cost: number;
}

interface SlotCard {
  container: Phaser.GameObjects.Container;
  buttons: PricedButton[];
  /** The buttons the turret keys press, by what they do. */
  unlock?: UiButton;
  build: UiButton[];
  upgrade?: UiButton;
  sell?: UiButton;
}

function textStyle(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: UI_FONT, fontSize: `${size}px`, color };
}

/**
 * The Turrets tab of the bottom panel: one card per turret slot.
 *
 * - The next locked slot offers an Unlock button with its price; later
 *   locked slots only show their price (slots unlock in order).
 * - An empty slot offers the current age's turrets (icon and price; hover
 *   shows the name).
 * - A built turret shows its name, its upgrade level (dots), an Upgrade
 *   button with the next level's price (Phase 11) and a Sell button with the
 *   refund.
 *
 * One card is chosen (outlined) for the keyboard: the slot keys choose it,
 * and the turret keys build, upgrade or unlock, and sell there (HUDScene's
 * keymap calls `select`, `build`, `upgrade`, `sell`).
 *
 * Like the Units tab it never touches state: `HUDScene` forwards the
 * relevant events and the cards emit `buy-slot-requested`,
 * `buy-turret-requested`, `upgrade-turret-requested` and
 * `sell-turret-requested`. `TurretSystem` decides.
 */
export class TurretPanel {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly side: Side;
  private readonly left: number;
  private readonly top: number;
  private readonly cards: SlotCard[] = [];
  private gold: number;
  private age: number;
  private unlockedSlots: number;
  private readonly turrets: (TurretState | null)[];
  private locked = false;
  /** The card the turret keys act on. */
  private selected = 0;
  private readonly selection: Phaser.GameObjects.Graphics;

  /** `left`/`top` are the outer top-left corner of the bottom panel. */
  constructor(scene: Phaser.Scene, side: Side, left: number, top: number, initial: TurretPanelInitial) {
    this.scene = scene;
    this.side = side;
    this.left = left;
    this.top = top;
    this.gold = initial.gold;
    this.age = initial.age;
    this.unlockedSlots = initial.unlockedSlots;
    this.turrets = initial.turrets.map((t) => (t ? { ...t } : null));
    this.root = scene.add.container(0, 0);
    this.selection = scene.add.graphics();
    this.root.add(this.selection);
    this.rebuildAll();
  }

  /** Keyboard: chooses the card the turret keys act on. False when there's no such slot. */
  select(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= MAX_TURRET_SLOTS) return false;
    this.selected = slotIndex;
    this.drawSelection();
    return true;
  }

  /** Keyboard: builds the age's `kind`-th turret (0-2) in the chosen slot. */
  build(kind: number): boolean {
    return this.pressOnSelected((card) => card.build[kind]);
  }

  /** Keyboard: upgrades the chosen slot's turret, or unlocks the slot when it is the next locked one. */
  upgrade(): boolean {
    return this.pressOnSelected((card) => card.upgrade ?? card.unlock);
  }

  /** Keyboard: sells the chosen slot's turret. */
  sell(): boolean {
    return this.pressOnSelected((card) => card.sell);
  }

  private pressOnSelected(pick: (card: SlotCard) => UiButton | undefined): boolean {
    const card = this.cards[this.selected];
    const button = card ? pick(card) : undefined;
    if (!button) return false;
    button.press();
    return true;
  }

  private drawSelection(): void {
    const x0 = this.left + PADDING + this.selected * (CARD_WIDTH + CARD_GAP);
    const y0 = this.top + PADDING;
    this.selection.clear();
    this.selection.lineStyle(2, UiColors.gold, 0.9);
    this.selection.strokeRoundedRect(x0 - 3, y0 - 3, CARD_WIDTH + 6, CARD_HEIGHT + 6, 6);
    this.root.bringToTop(this.selection);
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  setGold(gold: number): void {
    this.gold = gold;
    this.refreshButtons();
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.refreshButtons();
  }

  setAge(age: number): void {
    this.age = age;
    this.rebuildAll();
  }

  setUnlockedSlots(unlockedSlots: number): void {
    this.unlockedSlots = unlockedSlots;
    this.rebuildAll();
  }

  /** A turret was built in (state) or sold from (null) a slot. */
  setTurret(slotIndex: number, turret: TurretState | null): void {
    this.turrets[slotIndex] = turret ? { ...turret } : null;
    this.rebuildCard(slotIndex);
  }

  private rebuildAll(): void {
    for (let i = 0; i < MAX_TURRET_SLOTS; i++) this.rebuildCard(i);
  }

  private rebuildCard(slotIndex: number): void {
    this.cards[slotIndex]?.container.destroy();
    const x0 = this.left + PADDING + slotIndex * (CARD_WIDTH + CARD_GAP);
    const y0 = this.top + PADDING;
    const container = this.scene.add.container(x0, y0);
    const card: SlotCard = { container, buttons: [], build: [] };
    this.cards[slotIndex] = card;
    this.root.add(container);

    container.add([
      addPanel(this.scene, UiTextures.panel, CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, UiColors.panelMid),
      this.scene.add.text(8, 6, `Slot ${slotIndex + 1}`, textStyle(12, UiTextColors.dim)),
    ]);

    const turret = this.turrets[slotIndex];
    if (slotIndex >= this.unlockedSlots) this.fillLocked(card, slotIndex);
    else if (turret) this.fillBuilt(card, slotIndex, turret);
    else this.fillEmpty(card, slotIndex);
    this.refreshButtons();
    this.drawSelection();
  }

  private fillLocked(card: SlotCard, slotIndex: number): void {
    const cost = slotUnlockCost(slotIndex) ?? 0;
    const isNext = slotIndex === this.unlockedSlots;
    card.container.add(
      this.scene.add.text(CARD_WIDTH / 2, 40, 'Locked', textStyle(13, UiTextColors.dim)).setOrigin(0.5),
    );
    if (!isNext) {
      card.container.add(this.priceLabel(CARD_WIDTH / 2, 72, cost, 13));
      card.container.setAlpha(0.5);
      return;
    }
    const button = new UiButton(this.scene, CARD_WIDTH / 2, 74, CARD_WIDTH - 16, 30, {
      onPress: () => emit(Events.BuySlotRequested, { side: this.side }),
    });
    button.add(this.scene.add.text(-30, 0, 'Unlock', textStyle(12, UiTextColors.parchment)).setOrigin(0.5), this.priceLabel(28, 0, cost, 13));
    card.container.add(button.container);
    card.buttons.push({ button, cost });
    card.unlock = button;
  }

  private fillEmpty(card: SlotCard, slotIndex: number): void {
    const hint = this.scene.add.text(CARD_WIDTH - 8, 6, 'Build', textStyle(11, UiTextColors.parchment)).setOrigin(1, 0);
    card.container.add(hint);
    const turretIds = getAge(this.age).turretIds;
    turretIds.forEach((turretId, k) => {
      const definition = getTurretDefinition(turretId);
      const cx = 6 + k * (MINI_WIDTH + 4) + MINI_WIDTH / 2;
      const button = new UiButton(this.scene, cx, 26 + MINI_HEIGHT / 2, MINI_WIDTH, MINI_HEIGHT, {
        onPress: () => emit(Events.BuyTurretRequested, { side: this.side, slotIndex, turretId }),
        onHover: (over) => hint.setText(over ? definition.name : 'Build'),
      });
      const icon = this.scene.add.image(0, -10, textureKeyFor(definition.spriteKey, this.side));
      fitImage(icon, MINI_WIDTH - 8, 32);
      button.add(icon, this.priceLabel(0, 22, definition.cost, 11));
      card.container.add(button.container);
      card.buttons.push({ button, cost: definition.cost });
      card.build.push(button);
    });
  }

  private fillBuilt(card: SlotCard, slotIndex: number, turret: TurretState): void {
    const definition: TurretDefinition = getTurretDefinition(turret.turretId);
    const maxLevel = definition.upgrades.length;

    // Level dots in the header: filled for upgrades bought.
    const pips = this.scene.add.graphics();
    for (let i = 0; i < maxLevel; i++) {
      const x = CARD_WIDTH - 12 - (maxLevel - 1 - i) * 10;
      pips.fillStyle(i < turret.level ? UiColors.gold : 0x000000, i < turret.level ? 1 : 0.45);
      pips.fillCircle(x, 12, 3.5);
    }

    const icon = this.scene.add.image(CARD_WIDTH / 2, 44, textureKeyFor(definition.spriteKey, this.side));
    fitImage(icon, 40, 24);

    const next = definition.upgrades[turret.level];
    const upgrade = new UiButton(this.scene, CARD_WIDTH / 2, 68, CARD_WIDTH - 16, 18, {
      onPress: () => emit(Events.UpgradeTurretRequested, { side: this.side, slotIndex }),
    });
    if (next) {
      upgrade.add(
        this.scene.add.text(-24, 0, 'Upgrade', textStyle(11, UiTextColors.parchment)).setOrigin(0.5),
        this.priceLabel(30, 0, next.cost, 11),
      );
    } else {
      upgrade.add(this.scene.add.text(0, 0, 'Max level', textStyle(11, UiTextColors.dim)).setOrigin(0.5));
    }

    const refund = turretSellRefund(turret);
    const sell = new UiButton(this.scene, CARD_WIDTH / 2, 89, CARD_WIDTH - 16, 18, {
      onPress: () => emit(Events.SellTurretRequested, { side: this.side, slotIndex }),
    });
    sell.add(this.scene.add.text(0, 0, `Sell +${refund}`, textStyle(11, UiTextColors.gold)).setOrigin(0.5));

    card.container.add([
      pips,
      this.scene.add.text(CARD_WIDTH / 2, 24, definition.name, textStyle(11, UiTextColors.parchment)).setOrigin(0.5),
      icon,
      upgrade.container,
      sell.container,
    ]);
    // A maxed turret's upgrade button stays disabled whatever the gold.
    card.buttons.push({ button: upgrade, cost: next ? next.cost : Infinity });
    // Selling costs nothing, so it only depends on the lock, not on gold.
    card.buttons.push({ button: sell, cost: 0 });
    card.upgrade = upgrade;
    card.sell = sell;
  }


  /** A coin and a number, centered on (x, y), as a small container. */
  private priceLabel(x: number, y: number, cost: number, size: number): Phaser.GameObjects.Container {
    const text = this.scene.add.text(5, 0, String(cost), textStyle(size, UiTextColors.gold)).setOrigin(0.5);
    const coin = this.scene.add.circle(text.x - text.width / 2 - 7, 0, size >= 13 ? 5 : 4, UiColors.gold);
    return this.scene.add.container(x, y, [coin, text]);
  }

  private refreshButtons(): void {
    for (const card of this.cards) {
      if (!card) continue;
      for (const { button, cost } of card.buttons) button.setEnabled(!this.locked && this.gold >= cost);
    }
  }
}
