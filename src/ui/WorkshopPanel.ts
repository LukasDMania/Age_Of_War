import Phaser from 'phaser';
import {
  DEFAULT_MECH_DESIGN,
  MECH_OPTIONS,
  MECH_SLOT_NAMES,
  MECH_SLOTS,
  type MechDesign,
  type MechSlot,
} from '@config/mech.config';
import { designSummary, isValidDesign, lockedSlot, mechPart } from '@entities/mechDesign';
import type { MatchState } from '@state/GameState';
import type { MechState, Side } from '@state/types';
import { mechBuildMs, mechForgeLevel, mechPrice, mechRejection, type MechRejection } from '@systems/MechSystem';
import { addPanel, UI_FONT, UI_TITLE_FONT, UiColors, UiTextColors, UiTextures } from '@ui/kenneyUi';
import { keyHint } from '@ui/keymap';
import { UiButton } from '@ui/UiButton';
import { UnitBuyPanel } from '@ui/UnitBuyPanel';
import { emit, Events } from '@utils/EventBus';
import { drawMechPreview, MECH_PREVIEW_SIZE } from '@utils/MechArt';
import { TEAM_COLORS } from '@utils/RigArt';

const PADDING = 12;
const INNER_HEIGHT = UnitBuyPanel.HEIGHT - PADDING * 2;
const PREVIEW_WIDTH = 104;
const CARD_WIDTH = 96;
const CARD_GAP = 6;
const SECTION_GAP = 8;
const CARDS_LEFT = PADDING + PREVIEW_WIDTH + SECTION_GAP;
const RIGHT_LEFT = CARDS_LEFT + MECH_SLOTS.length * CARD_WIDTH + (MECH_SLOTS.length - 1) * CARD_GAP + SECTION_GAP;
const RIGHT_WIDTH = UnitBuyPanel.WIDTH - PADDING - RIGHT_LEFT;
const BUILD_HEIGHT = 34;
const ARROW_SIZE = 22;
const PREVIEW_KEY = 'mech-preview';
const STORAGE_KEY = 'aow-mech-design';
const RED = '#f08a80';

function textStyle(size: number, color: string, weight = '500'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: weight, color };
}

/** The last design the player built or tried (per browser). */
function loadDesign(): MechDesign {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isValidDesign(parsed)) return { ...parsed };
  } catch {
    // Storage blocked or garbled: start from the default.
  }
  return { ...DEFAULT_MECH_DESIGN };
}

function saveDesign(design: MechDesign): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
  } catch {
    // Not kept, nothing else lost.
  }
}

interface PartCard {
  button: UiButton;
  name: Phaser.GameObjects.Text;
  about: Phaser.GameObjects.Text;
  foot: Phaser.GameObjects.Text;
}

/**
 * The Workshop tab (Mech workshop, 2026-09-27): build your own Mech from
 * five parts. Left, a preview of the design in your age's look; middle, one
 * card per slot (legs, torso, head, left arm, right arm) with arrows that
 * switch its part; right, what the design costs and does, and the Build
 * button, which turns into the build's progress and then says the Mech is
 * in battle.
 *
 * Keys (keymap): 1-5 choose a card, Q / E switch its part, R builds. The
 * design is kept per browser. Parts that need a higher Forge level can be
 * tried on (the card says what they need) but not built.
 *
 * It never touches game state: it reads the player's side for gold, age and
 * Forge level when told something changed, and asks for the build with
 * `build-mech-requested`. `MechSystem` has the final say.
 */
export class WorkshopPanel {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly state: MatchState;
  private readonly side: Side;
  private readonly left: number;
  private readonly top: number;
  private design: MechDesign;
  private selected: MechSlot = 'legs';
  private cards = new Map<MechSlot, PartCard>();
  private preview!: Phaser.GameObjects.Image;
  private costText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private buildButton!: UiButton;
  private buildLabel!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Graphics;
  private mech: MechState;
  private locked = false;

  constructor(scene: Phaser.Scene, side: Side, state: MatchState, left: number, top: number) {
    this.scene = scene;
    this.side = side;
    this.state = state;
    this.left = left;
    this.top = top;
    this.design = loadDesign();
    const own = state[side].mech;
    this.mech = { alive: own.alive, build: own.build ? { ...own.build } : null };
    this.root = scene.add.container(0, 0);
    this.buildPreview();
    MECH_SLOTS.forEach((slot, i) => this.buildCard(slot, i));
    this.buildRight();
    this.refresh();
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.refreshBuild();
  }

  /** Gold changed: the Build button and the price color. */
  setGold(): void {
    this.refreshBuild();
  }

  /** The Mech started, progressed, walked out or fell (`mech-changed`). */
  setMech(mech: MechState): void {
    this.mech = mech;
    this.refreshBuild();
  }

  /** The Forge level changed: part locks. */
  refresh(): void {
    for (const slot of MECH_SLOTS) this.refreshCard(slot);
    this.refreshDesign();
  }

  /** Chooses a part card (slot keys). False for a slot the Workshop hasn't. */
  select(index: number): boolean {
    const slot = MECH_SLOTS[index];
    if (!slot) return false;
    this.selected = slot;
    for (const [s, card] of this.cards) card.button.setSelected(s === slot);
    return true;
  }

  /** Switches the chosen card's part to the next (+1) or previous (-1) option. */
  cycle(by: number, slot: MechSlot = this.selected): void {
    const options = MECH_OPTIONS[slot];
    const index = options.indexOf(this.design[slot]);
    const next = options[(index + by + options.length) % options.length];
    if (!next) return;
    this.design = { ...this.design, [slot]: next } as MechDesign;
    saveDesign(this.design);
    this.refreshCard(slot);
    this.refreshDesign();
  }

  /** Asks to build the design (the R key, the Build button). False if it can't be built now. */
  build(): boolean {
    if (this.locked || this.rejection() !== null) return false;
    emit(Events.BuildMechRequested, { side: this.side, design: { ...this.design } });
    return true;
  }

  private rejection(): MechRejection | null {
    return mechRejection(this.state, this.side, this.design);
  }

  /* ---- Building the tab --------------------------------------------------------------------- */

  private buildPreview(): void {
    const x = this.left + PADDING;
    const y = this.top + PADDING;
    this.root.add(addPanel(this.scene, UiTextures.panel, x + PREVIEW_WIDTH / 2, y + INNER_HEIGHT / 2, PREVIEW_WIDTH, INNER_HEIGHT, UiColors.panelMid));
    this.preview = this.scene.add.image(x + PREVIEW_WIDTH / 2, y + INNER_HEIGHT - 4, '__DEFAULT').setOrigin(0.5, 1);
    this.root.add(this.preview);
  }

  private buildCard(slot: MechSlot, index: number): void {
    const x = this.left + CARDS_LEFT + index * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2;
    const y = this.top + PADDING + INNER_HEIGHT / 2;
    const button = new UiButton(this.scene, x, y, CARD_WIDTH, INNER_HEIGHT, {
      onPress: () => this.select(index),
      tint: UiColors.panelMid,
      hoverTint: UiColors.panelHover,
    });
    const left = -CARD_WIDTH / 2 + 6;
    const hint = this.scene.add.text(left, -INNER_HEIGHT / 2 + 10, keyHint(`slot-${index + 1}`), textStyle(11, UiTextColors.dim)).setOrigin(0, 0.5);
    const title = this.scene.add
      .text(left + (hint.width > 0 ? hint.width + 5 : 0), -INNER_HEIGHT / 2 + 10, MECH_SLOT_NAMES[slot], textStyle(11, UiTextColors.dim, '600'))
      .setOrigin(0, 0.5);
    const name = this.scene.add.text(0, -INNER_HEIGHT / 2 + 28, '', textStyle(13, UiTextColors.parchment, '600')).setOrigin(0.5);
    const about = this.scene.add
      .text(0, -INNER_HEIGHT / 2 + 42, '', { ...textStyle(10, UiTextColors.dim), align: 'center', wordWrap: { width: CARD_WIDTH - 10 } })
      .setOrigin(0.5, 0);
    const foot = this.scene.add.text(0, INNER_HEIGHT / 2 - 13, '', textStyle(11, UiTextColors.gold, '600')).setOrigin(0.5);
    const arrow = (dx: number, label: string, by: number): UiButton => {
      const a = new UiButton(this.scene, dx, INNER_HEIGHT / 2 - 13, ARROW_SIZE, ARROW_SIZE - 2, {
        onPress: () => {
          this.select(index);
          this.cycle(by, slot);
        },
        tint: UiColors.panelDark,
        hoverTint: UiColors.panelHover,
      });
      a.add(this.scene.add.text(0, -1, label, textStyle(13, UiTextColors.parchment, '600')).setOrigin(0.5));
      return a;
    };
    button.add(
      hint,
      title,
      name,
      about,
      foot,
      arrow(-CARD_WIDTH / 2 + 4 + ARROW_SIZE / 2, '<', -1).container,
      arrow(CARD_WIDTH / 2 - 4 - ARROW_SIZE / 2, '>', 1).container,
    );
    button.setSelected(slot === this.selected);
    this.root.add(button.container);
    this.cards.set(slot, { button, name, about, foot });
  }

  private buildRight(): void {
    const x = this.left + RIGHT_LEFT;
    const y = this.top + PADDING;
    this.root.add(
      this.scene.add.text(x + 2, y + 8, 'Mech', { fontFamily: UI_TITLE_FONT, fontSize: '17px', color: UiTextColors.title }).setOrigin(0, 0.5),
    );
    this.costText = this.scene.add.text(x + RIGHT_WIDTH - 2, y + 8, '', textStyle(15, UiTextColors.gold, '600')).setOrigin(1, 0.5);
    this.statsText = this.scene.add.text(x + 2, y + 21, '', { ...textStyle(11, UiTextColors.parchment), lineSpacing: 1 }).setOrigin(0, 0);
    this.buildButton = new UiButton(this.scene, x + RIGHT_WIDTH / 2, y + INNER_HEIGHT - BUILD_HEIGHT / 2, RIGHT_WIDTH, BUILD_HEIGHT, {
      onPress: () => this.build(),
      tint: UiColors.ready,
      hoverTint: UiColors.panelHover,
      framed: true,
    });
    this.progress = this.scene.add.graphics();
    this.buildLabel = this.scene.add.text(0, 0, '', textStyle(13, UiTextColors.parchment, '600')).setOrigin(0.5);
    this.buildButton.add(this.progress, this.buildLabel);
    this.root.add([this.costText, this.statsText, this.buildButton.container]);
  }

  /* ---- Refreshing --------------------------------------------------------------------------- */

  private refreshCard(slot: MechSlot): void {
    const card = this.cards.get(slot);
    if (!card) return;
    const part = mechPart(this.design, slot);
    card.name.setText(part.name).setScale(1);
    if (card.name.width > CARD_WIDTH - 8) card.name.setScale((CARD_WIDTH - 8) / card.name.width);
    card.about.setText(part.about);
    const me = this.state[this.side];
    const forge = mechForgeLevel(me);
    if ((part.forge ?? 0) > forge) card.foot.setText(`Forge ${(part.forge ?? 0) - me.traits.mechForgeBonus}`).setColor(RED);
    else card.foot.setText('●'.repeat(part.tier) + '○'.repeat(3 - part.tier)).setColor(UiTextColors.gold);
  }

  /** Preview and numbers of the current design. */
  private refreshDesign(): void {
    const age = this.state[this.side].age;
    drawMechPreview(this.scene, PREVIEW_KEY, { ...this.design, age }, TEAM_COLORS[this.side]);
    this.preview.setTexture(PREVIEW_KEY);
    const scale = Math.min((PREVIEW_WIDTH - 6) / MECH_PREVIEW_SIZE.width, (INNER_HEIGHT - 6) / MECH_PREVIEW_SIZE.height);
    this.preview.setDisplaySize(MECH_PREVIEW_SIZE.width * scale, MECH_PREVIEW_SIZE.height * scale);
    const s = designSummary(this.design, age);
    const tough = s.toughness > s.hp ? ` (${s.toughness.toLocaleString('en-US')} eff.)` : '';
    this.statsText.setText(
      [
        `HP ${s.hp.toLocaleString('en-US')}${tough}`,
        s.armed ? `Damage ${s.dps}/s` : 'No weapon',
        `Build ${Math.round(mechBuildMs(this.state[this.side], this.design) / 1000)}s`,
      ].join('\n'),
    );
    this.refreshBuild();
  }

  private refreshBuild(): void {
    if (!this.buildButton) return;
    const me = this.state[this.side];
    const cost = mechPrice(me, this.design);
    this.costText.setText(String(cost)).setColor(me.gold >= cost ? UiTextColors.gold : RED);
    const rejection = this.rejection();
    this.buildButton.setEnabled(!this.locked && rejection === null);
    const key = keyHint('mech-build');
    this.progress.clear();
    const build = this.mech.build;
    if (build) {
      const done = 1 - build.remainingMs / Math.max(1, build.totalMs);
      const w = RIGHT_WIDTH - 12;
      this.progress.fillStyle(UiColors.good, 0.55).fillRect(-w / 2, -BUILD_HEIGHT / 2 + 5, w * done, BUILD_HEIGHT - 10);
      this.buildLabel.setText(build.remainingMs > 0 ? `Building ${Math.ceil(build.remainingMs / 1000)}s` : 'Waiting for room');
      // A build in progress stays readable (the button is only greyed).
      this.buildButton.container.setAlpha(1);
      return;
    }
    const labels: Record<MechRejection, string> = {
      'not-playing': 'Build',
      'player-only': 'Not for this side',
      invalid: 'Unknown part',
      locked: `Needs Forge ${this.forgeNeeded()}`,
      building: 'Building',
      alive: 'Mech in battle',
      'cannot-afford': 'Need gold',
    };
    this.buildLabel.setText(rejection === null ? `Build${key ? ` (${key})` : ''}` : labels[rejection]);
  }

  private forgeNeeded(): number {
    const me = this.state[this.side];
    const slot = lockedSlot(this.design, mechForgeLevel(me));
    return slot ? (mechPart(this.design, slot).forge ?? 0) - me.traits.mechForgeBonus : 0;
  }
}
