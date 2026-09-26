import Phaser from 'phaser';
import { AGE_NAMES } from '@config/ages.config';
import {
  BUILDING_IDS,
  BUILDINGS,
  buildingUpgradeCost,
  MAX_BUILDING_LEVEL,
  type BuildingId,
} from '@config/buildings.config';
import type { SideState } from '@state/GameState';
import type { Side } from '@state/types';
import { buildingRejection, libraryXpPerSec, mineGoldPerSec } from '@systems/BuildingSystem';
import { addPanel, UI_FONT, UiColors, UiTextColors, UiTextures } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import { UnitBuyPanel } from '@ui/UnitBuyPanel';
import { emit, Events } from '@utils/EventBus';

const PADDING = 12;
const GAP = 12;
const CARD_HEIGHT = UnitBuyPanel.HEIGHT - PADDING * 2;
const CARD_WIDTH = (UnitBuyPanel.WIDTH - PADDING * 2 - GAP * (BUILDING_IDS.length - 1)) / BUILDING_IDS.length;

function textStyle(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: UI_FONT, fontSize: `${size}px`, color };
}

interface Card {
  container: Phaser.GameObjects.Container;
  button: UiButton;
}

/**
 * HUD tab for the buildings behind the base (Phase 14): one card per
 * building with its level, what it gives now, and a Build/Upgrade button.
 * Reads the side's state when told something changed (gold, age, a level);
 * presses only emit `upgrade-building-requested`.
 */
export class BuildingPanel {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly side: Side;
  private readonly sideState: SideState;
  private readonly left: number;
  private readonly top: number;
  private readonly cards = new Map<BuildingId, Card>();
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
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.refreshButtons();
  }

  /** Levels or age changed: redraw the cards. */
  rebuild(): void {
    BUILDING_IDS.forEach((id, index) => this.buildCard(id, index));
    this.refreshButtons();
  }

  /** Gold changed: only the buttons' enabled state can change. */
  refreshButtons(): void {
    for (const [id, card] of this.cards) {
      const rejection = buildingRejection(this.sideState, id);
      card.button.setEnabled(!this.locked && rejection === null);
    }
  }

  private buildCard(id: BuildingId, index: number): void {
    this.cards.get(id)?.container.destroy();
    const def = BUILDINGS[id];
    const level = this.sideState.buildings[id];
    const x0 = this.left + PADDING + index * (CARD_WIDTH + GAP);
    const y0 = this.top + PADDING;
    const container = this.scene.add.container(x0, y0);
    this.root.add(container);

    const pips = this.scene.add.graphics();
    for (let i = 0; i < MAX_BUILDING_LEVEL; i++) {
      const x = CARD_WIDTH - 14 - (MAX_BUILDING_LEVEL - 1 - i) * 11;
      pips.fillStyle(i < level ? UiColors.gold : 0x000000, i < level ? 1 : 0.45);
      pips.fillCircle(x, 13, 4);
    }
    container.add([
      addPanel(this.scene, UiTextures.panel, CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, UiColors.panelMid),
      this.scene.add.text(10, 6, def.name, textStyle(15, UiTextColors.parchment)),
      pips,
      this.scene.add.text(10, 28, this.effectText(id, level), textStyle(12, level > 0 ? UiTextColors.gold : UiTextColors.dim)),
    ]);

    const cost = buildingUpgradeCost(id, level);
    const button = new UiButton(this.scene, CARD_WIDTH / 2, CARD_HEIGHT - 20, CARD_WIDTH - 16, 28, {
      onPress: () => emit(Events.UpgradeBuildingRequested, { side: this.side, buildingId: id }),
    });
    const rejection = buildingRejection(this.sideState, id);
    if (cost === null) {
      button.add(this.scene.add.text(0, 0, 'Max level', textStyle(12, UiTextColors.dim)).setOrigin(0.5));
    } else if (rejection === 'age-locked') {
      const needed = AGE_NAMES[level] ?? '';
      button.add(this.scene.add.text(0, 0, `Needs ${needed} Age · ${cost}`, textStyle(12, UiTextColors.dim)).setOrigin(0.5));
    } else {
      button.add(
        this.scene.add.text(-30, 0, level === 0 ? 'Build' : `Upgrade to ${level + 1}`, textStyle(12, UiTextColors.parchment)).setOrigin(0.5),
        this.priceLabel(56, 0, cost),
      );
    }
    container.add(button.container);
    this.cards.set(id, { container, button });
  }

  private effectText(id: BuildingId, level: number): string {
    if (level === 0) return BUILDINGS[id].blurb;
    switch (id) {
      case 'mine':
        return `+${mineGoldPerSec(this.sideState).toFixed(1)} gold/s`;
      case 'library':
        return `+${libraryXpPerSec(this.sideState).toFixed(1)} XP/s`;
      case 'forge':
        return `Research tier ${level} unlocked`;
    }
  }

  private priceLabel(x: number, y: number, cost: number): Phaser.GameObjects.Container {
    const text = this.scene.add.text(5, 0, String(cost), textStyle(12, UiTextColors.gold)).setOrigin(0.5);
    const coin = this.scene.add.circle(text.x - text.width / 2 - 7, 0, 4, UiColors.gold);
    return this.scene.add.container(x, y, [coin, text]);
  }
}
