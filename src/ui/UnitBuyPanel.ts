import Phaser from 'phaser';
import { getAge } from '@config/ages.config';
import { UNIT_QUEUE_LIMIT } from '@config/constants';
import { getUnitDefinition, type UnitDefinition } from '@entities/unitDefinitions';
import type { QueuedUnit, Side } from '@state/types';
import { unitPrice, type SideTraits } from '@state/traits';
import { addPanel, fitImage, UI_FONT, UiColors, UiTextColors, UiTextures } from '@ui/kenneyUi';
import { keyHint } from '@ui/keymap';
import { UiButton, type PressModifiers } from '@ui/UiButton';
import { emit, Events } from '@utils/EventBus';
import { unitIcon } from '@entities/unitArt';

const PADDING = 12;
const BUTTON_SIZE = 100;
const BUTTON_GAP = 8;
const SECTION_GAP = 16;
const QUEUE_WIDTH = 216;
const SLOT_SIZE = 36;
const SLOT_GAP = 6;
const PROGRESS_HEIGHT = 10;
const BUTTONS_WIDTH = 5 * BUTTON_SIZE + 4 * BUTTON_GAP;

export interface UnitBuyPanelInitial {
  gold: number;
  age: number;
  queue: readonly QueuedUnit[];
  /** The side's traits (Conquest rewards can change prices); fixed for the match. */
  traits: SideTraits;
}

interface BuyButton {
  definition: UnitDefinition;
  button: UiButton;
}

interface QueueSlot {
  icon: Phaser.GameObjects.Image;
  unitId: string | null;
}

/**
 * The Units tab of the bottom panel: one button per slot of the current age
 * (cost, greyed out when unaffordable, when the queue is full, or while the
 * match is not being played) plus the training queue with a progress bar for
 * the unit in front. The slot keys (1-5 by default) press the matching
 * button while this tab is open (HUDScene's keymap calls `pressSlot`).
 *
 * It never touches game state: `HUDScene` tells it about gold, age and queue
 * changes (from the event bus) and it asks for purchases by emitting
 * `buy-unit-requested`. `SpawnSystem` has the final say.
 */
export class UnitBuyPanel {
  /** Outer size of the bottom panel this tab is drawn in. */
  static readonly WIDTH = PADDING * 2 + BUTTONS_WIDTH + SECTION_GAP + QUEUE_WIDTH;
  static readonly HEIGHT = PADDING * 2 + BUTTON_SIZE;

  /** Everything this tab draws, so it can be shown and hidden as one. */
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly side: Side;
  private readonly left: number;
  private readonly top: number;
  private buttons: BuyButton[] = [];
  private readonly slots: QueueSlot[] = [];
  private readonly queueCount: Phaser.GameObjects.Text;
  private readonly progress: Phaser.GameObjects.Graphics;
  private readonly progressWidth: number;
  private gold: number;
  private queueLength: number;
  private readonly traits: SideTraits;
  /** True while the match is not being played (paused, over): nothing can be bought. */
  private locked = false;

  /** `left`/`top` are the outer top-left corner of the bottom panel. */
  constructor(scene: Phaser.Scene, side: Side, left: number, top: number, initial: UnitBuyPanelInitial) {
    this.scene = scene;
    this.side = side;
    this.left = left;
    this.top = top;
    this.gold = initial.gold;
    this.queueLength = initial.queue.length;
    this.traits = initial.traits;
    this.root = scene.add.container(0, 0);

    // Training queue section, right of the buttons.
    const qx = left + PADDING + BUTTONS_WIDTH + SECTION_GAP;
    const qy = top + PADDING;
    this.root.add([
      addPanel(scene, UiTextures.panel, qx + QUEUE_WIDTH / 2, qy + BUTTON_SIZE / 2, QUEUE_WIDTH, BUTTON_SIZE, UiColors.panelMid),
      scene.add.text(qx + 10, qy + 8, 'Training', { fontFamily: UI_FONT, fontSize: '13px', color: UiTextColors.parchment }),
    ]);
    this.queueCount = scene.add
      .text(qx + QUEUE_WIDTH - 10, qy + 8, '', { fontFamily: UI_FONT, fontSize: '13px', color: UiTextColors.dim })
      .setOrigin(1, 0);
    this.root.add(this.queueCount);

    const slotsWidth = UNIT_QUEUE_LIMIT * SLOT_SIZE + (UNIT_QUEUE_LIMIT - 1) * SLOT_GAP;
    const slotsLeft = qx + (QUEUE_WIDTH - slotsWidth) / 2;
    const slotCenterY = qy + 30 + SLOT_SIZE / 2;
    for (let i = 0; i < UNIT_QUEUE_LIMIT; i++) {
      const cx = slotsLeft + i * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2;
      const frame = addPanel(scene, UiTextures.frame, cx, slotCenterY, SLOT_SIZE, SLOT_SIZE, i === 0 ? UiColors.gold : UiColors.panelHover);
      const icon = scene.add.image(cx, slotCenterY, '__DEFAULT').setVisible(false);
      this.root.add([frame, icon]);
      this.slots.push({ icon, unitId: null });
    }
    this.progressWidth = slotsWidth;
    this.progress = scene.add.graphics().setPosition(slotsLeft, qy + 30 + SLOT_SIZE + 10);
    this.root.add(this.progress);

    this.buildButtons(initial.age);
    this.setQueue(initial.queue);
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  setGold(gold: number): void {
    this.gold = gold;
    this.refreshButtons();
  }

  /** Greys out every button while purchases are impossible (paused, game over). */
  setLocked(locked: boolean): void {
    this.locked = locked;
    this.refreshButtons();
  }

  /** Swaps the buttons for the new age's five units. */
  setAge(age: number): void {
    for (const { button } of this.buttons) button.destroy();
    this.buildButtons(age);
  }

  setQueue(queue: readonly QueuedUnit[]): void {
    this.queueLength = queue.length;
    this.queueCount.setText(`${queue.length}/${UNIT_QUEUE_LIMIT}`);

    this.slots.forEach((slot, i) => {
      const unitId = queue[i]?.unitId ?? null;
      if (unitId === slot.unitId) return;
      slot.unitId = unitId;
      if (!unitId) {
        slot.icon.setVisible(false);
        return;
      }
      const definition = getUnitDefinition(unitId);
      const iconArt = unitIcon(this.scene, definition, this.side);
      slot.icon.setTexture(iconArt.key, iconArt.frame).setVisible(true);
      fitImage(slot.icon, SLOT_SIZE - 10, SLOT_SIZE - 10);
    });

    this.progress.clear();
    this.progress.fillStyle(0x000000, 0.65);
    this.progress.fillRect(0, 0, this.progressWidth, PROGRESS_HEIGHT);
    const front = queue[0];
    if (front) {
      const total = getUnitDefinition(front.unitId).trainTimeMs;
      const ratio = total > 0 ? Phaser.Math.Clamp(1 - front.remainingMs / total, 0, 1) : 1;
      // Yellow when trained but waiting for the spawn point to clear.
      this.progress.fillStyle(front.remainingMs > 0 ? UiColors.good : UiColors.warn, 1);
      this.progress.fillRect(0, 0, this.progressWidth * ratio, PROGRESS_HEIGHT);
    }

    this.refreshButtons();
  }

  destroy(): void {
    // Nothing to release: the buttons go with the scene.
  }

  /** Presses slot `slot` (1-5) as a click would; false when there is no such slot. */
  pressSlot(slot: number, modifiers: PressModifiers): boolean {
    const entry = this.buttons[slot - 1];
    if (!entry) return false;
    entry.button.press(modifiers);
    return true;
  }

  private buildButtons(age: number): void {
    const unitIds = getAge(age).unitIds;
    const centerY = this.top + PADDING + BUTTON_SIZE / 2;
    this.buttons = unitIds.map((unitId, i) => {
      const definition = getUnitDefinition(unitId);
      const centerX = this.left + PADDING + i * (BUTTON_SIZE + BUTTON_GAP) + BUTTON_SIZE / 2;
      return { definition, button: this.buildButton(definition, centerX, centerY, i + 1) };
    });
    this.refreshButtons();
  }

  private buildButton(definition: UnitDefinition, x: number, y: number, hotkey: number): UiButton {
    const scene = this.scene;
    const half = BUTTON_SIZE / 2;
    const button = new UiButton(scene, x, y, BUTTON_SIZE, BUTTON_SIZE, {
      onPress: () => emit(Events.BuyUnitRequested, { side: this.side, unitId: definition.id }),
    });
    const key = scene.add.text(-half + 7, -half + 5, keyHint(`slot-${hotkey}`), {
      fontFamily: UI_FONT,
      fontSize: '12px',
      color: UiTextColors.dim,
    });
    const iconArt = unitIcon(this.scene, definition, this.side);
    const icon = scene.add.image(0, -10, iconArt.key, iconArt.frame);
    fitImage(icon, 56, 44);
    const name = scene.add
      .text(0, 22, definition.name, { fontFamily: UI_FONT, fontSize: '11px', color: UiTextColors.parchment })
      .setOrigin(0.5);
    const cost = scene.add
      .text(5, 38, String(unitPrice(this.traits, definition)), {
        fontFamily: UI_FONT,
        fontSize: '14px',
        // A price changed by a Conquest reward shows in green (cheaper) or red.
        color: unitPrice(this.traits, definition) < definition.cost ? '#8fe08f' : unitPrice(this.traits, definition) > definition.cost ? '#f08a80' : UiTextColors.gold,
      })
      .setOrigin(0.5);
    const coin = scene.add.circle(cost.x - cost.width / 2 - 8, 38, 5, UiColors.gold);
    button.add(key, icon, name, coin, cost);
    this.root.add(button.container);
    return button;
  }

  private refreshButtons(): void {
    const queueFull = this.queueLength >= UNIT_QUEUE_LIMIT;
    for (const { definition, button } of this.buttons) {
      button.setEnabled(!this.locked && !queueFull && this.gold >= unitPrice(this.traits, definition));
    }
  }
}
