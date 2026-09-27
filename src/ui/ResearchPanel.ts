import Phaser from 'phaser';
import {
  MAX_RESEARCH_TIER,
  RESEARCH,
  forgeLevelForTier,
  researchMult,
  type ResearchDefinition,
  type ResearchId,
} from '@config/buildings.config';
import type { SideState } from '@state/GameState';
import type { Side } from '@state/types';
import { researchPrice, researchRejection } from '@systems/BuildingSystem';
import { UI_FONT, UiColors, UiTextColors } from '@ui/kenneyUi';
import { keyHint } from '@ui/keymap';
import { UiButton, type PressModifiers } from '@ui/UiButton';
import { UnitBuyPanel } from '@ui/UnitBuyPanel';
import { emit, Events } from '@utils/EventBus';

const PADDING = 12;
const GAP = 8;
const COLUMNS = 5;
const ROWS = 2;
const CELL_WIDTH = (UnitBuyPanel.WIDTH - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const CELL_HEIGHT = (UnitBuyPanel.HEIGHT - PADDING * 2 - GAP * (ROWS - 1)) / ROWS;

function textStyle(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: UI_FONT, fontSize: `${size}px`, color };
}

/** "+20%" / "-12%" for a track at a tier. */
function bonusText(def: ResearchDefinition, tier: number): string {
  const pct = Math.round((researchMult(def.id, tier) - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

/**
 * HUD tab for Forge research (Phase 14): a grid of tracks, each showing its
 * tier, its current bonus and the price of the next tier (or what locks it).
 * Hovering shows the next bonus in the info cell. Shift or Ctrl (Cmd)
 * buys as many tiers as the Forge and the gold allow, one request each.
 * Presses only emit `research-requested`.
 */
export class ResearchPanel {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly side: Side;
  private readonly sideState: SideState;
  private readonly left: number;
  private readonly top: number;
  private readonly cells = new Map<ResearchId, { container: Phaser.GameObjects.Container; button: UiButton }>();
  private info!: Phaser.GameObjects.Text;
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

  refreshButtons(): void {
    for (const [id, cell] of this.cells) {
      cell.button.setEnabled(!this.locked && researchRejection(this.sideState, id) === null);
    }
  }

  /** Tiers or the Forge level changed: redraw every cell. */
  rebuild(): void {
    this.root.removeAll(true);
    this.cells.clear();
    RESEARCH.forEach((def, index) => this.buildCell(def, index));
    const { x, y } = this.cellOrigin(RESEARCH.length);
    this.info = this.scene.add
      .text(x + 6, y + 4, this.defaultInfo(), { ...textStyle(11, UiTextColors.dim), wordWrap: { width: CELL_WIDTH - 8 } })
      .setOrigin(0, 0);
    this.root.add(this.info);
    this.refreshButtons();
  }

  /** Presses a track's cell as a click with these modifiers would (keyboard). */
  press(id: ResearchId, modifiers: PressModifiers): void {
    this.cells.get(id)?.button.press(modifiers);
  }

  private buyTiers(id: ResearchId, modifiers: PressModifiers): void {
    const many = modifiers.shift || modifiers.ctrl;
    do {
      const before = this.sideState.research[id];
      emit(Events.ResearchRequested, { side: this.side, researchId: id });
      if (this.sideState.research[id] === before) return;
    } while (many);
  }

  private defaultInfo(): string {
    const forge = this.sideState.buildings.forge;
    if (forge === 0) return 'Build a Forge to unlock research';
    const open = Math.min(MAX_RESEARCH_TIER, Math.floor((forge - 1) / 5) + 1);
    return `Forge level ${forge}:\ntiers 1-${open} open`;
  }

  private cellOrigin(index: number): { x: number; y: number } {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return {
      x: this.left + PADDING + col * (CELL_WIDTH + GAP),
      y: this.top + PADDING + row * (CELL_HEIGHT + GAP),
    };
  }

  private buildCell(def: ResearchDefinition, index: number): void {
    const { x, y } = this.cellOrigin(index);
    const tier = this.sideState.research[def.id];
    const cost = researchPrice(this.sideState, def.id);
    const rejection = researchRejection(this.sideState, def.id);
    const button = new UiButton(this.scene, x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2, CELL_WIDTH, CELL_HEIGHT, {
      onPress: (modifiers) => this.buyTiers(def.id, modifiers),
      tint: UiColors.panelMid,
      hoverTint: UiColors.panelHover,
      onHover: (over) => {
        if (!over) {
          this.info.setText(this.defaultInfo());
          return;
        }
        const next = tier < MAX_RESEARCH_TIER ? ` -> ${bonusText(def, tier + 1)}` : ' (max)';
        this.info.setText(`${def.name}\n${bonusText(def, tier)}${next}`);
      },
    });
    const left = -CELL_WIDTH / 2 + 6;
    const right = CELL_WIDTH / 2 - 6;
    let bottom: Phaser.GameObjects.GameObject;
    if (cost === null) bottom = this.scene.add.text(left, 8, `Max ${bonusText(def, tier)}`, textStyle(11, UiTextColors.dim)).setOrigin(0, 0.5);
    else if (rejection === 'forge-level')
      bottom = this.scene.add.text(left, 8, `Forge ${forgeLevelForTier(tier + 1)} · ${cost}`, textStyle(11, UiTextColors.dim)).setOrigin(0, 0.5);
    else bottom = this.priceRow(left, 8, cost, tier > 0 ? bonusText(def, tier) : '');
    const hint = this.scene.add.text(left, -10, keyHint(`slot-${index + 1}`), textStyle(11, UiTextColors.dim)).setOrigin(0, 0.5);
    button.add(
      hint,
      this.scene.add.text(left + (hint.width > 0 ? hint.width + 5 : 0), -10, def.short, textStyle(12, UiTextColors.parchment)).setOrigin(0, 0.5),
      this.scene.add.text(right, -10, `${tier}/${MAX_RESEARCH_TIER}`, textStyle(11, UiTextColors.dim)).setOrigin(1, 0.5),
      bottom,
    );
    this.root.add(button.container);
    this.cells.set(def.id, { container: button.container, button });
  }

  private priceRow(x: number, y: number, cost: number, current: string): Phaser.GameObjects.Container {
    const coin = this.scene.add.circle(4, 0, 4, UiColors.gold);
    const text = this.scene.add.text(12, 0, String(cost), textStyle(11, UiTextColors.gold)).setOrigin(0, 0.5);
    const now = this.scene.add.text(CELL_WIDTH - 12, 0, current, textStyle(11, UiTextColors.dim)).setOrigin(1, 0.5);
    return this.scene.add.container(x, y, [coin, text, now]);
  }
}
