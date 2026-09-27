import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '@config/constants';
import { ARMY_COUNT, KEY_ACTIONS, getKeyAction, type KeyAction, type KeyActionId } from '@config/keybindings.config';
import {
  armyLabel,
  getArmy,
  setArmy,
  SLOT_ROLES,
  unitCount,
  withoutLastUnit,
  withUnit,
  type UnitSlot,
} from '@ui/compositions';
import { addThemedPanel, UI_FONT, UI_TITLE_FONT, UiColors, UiTextColors } from '@ui/kenneyUi';
import {
  actionAvailable,
  bindingsFor,
  bindingsLabel,
  comboFromEvent,
  comboLabel,
  conflictsOf,
  resetBindings,
  setBindings,
  setKeysSuspended,
} from '@ui/keymap';
import { UiButton } from '@ui/UiButton';
import { emit, Events } from '@utils/EventBus';

/** Which scene opened the screen (it is paused meanwhile and resumed on close). */
export interface ControlsSceneData {
  from?: string;
}

type Page = 'keys' | 'armies';

const PANEL_W = 1200;
const PANEL_H = 660;
const LEFT = (GAME_WIDTH - PANEL_W) / 2;
const TOP = (GAME_HEIGHT - PANEL_H) / 2;
const COLUMN_W = 370;
const ROW_H = 20;
const HEADER_H = 26;
const LIST_TOP = TOP + 104;
const LIST_BOTTOM = TOP + PANEL_H - 78;
const ARMY_ROW_H = 56;

const SLOTS: readonly UnitSlot[] = [1, 2, 3, 4, 5];

/** One focusable thing on a page (keyboard moves between them). */
interface Row {
  column: number;
  button: UiButton;
  /** Enter on it; `add` when Shift is held (keys page: add a second key). */
  activate: (add: boolean) => void;
  /** The key action it shows (keys page). */
  action?: KeyActionId;
}

function text(size: number, color: string, weight = '500'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: UI_FONT, fontSize: `${size}px`, color, fontStyle: weight };
}

/**
 * Controls (owner, 2026-09-27: "fully playable by keyboard only and mapable
 * buttons", then army compositions). Two pages:
 *
 * - **Keys**: every action of `config/keybindings.config.ts` by group, with
 *   its keys. Click one (or Enter on it) and press the new key: it replaces
 *   the action's keys (with Shift held on the click or Enter, it's added as
 *   another key). Esc cancels. Keys that also trigger another action in the
 *   same situation are red, and the line below names the other action.
 * - **Armies**: the eight unit compositions: add units by slot in any
 *   amount and order, undo, clear; their queue and save keys are rebound
 *   here too.
 *
 * Keyboard: arrows move, Tab switches page, Enter rebinds, on Armies 1-5 add
 * a unit and Backspace undoes, Esc closes. While open, every other scene's
 * keys are suspended; on close it emits `keybindings-changed` so the HUD
 * redraws its key labels. Settings are kept per browser (`ui/keymap.ts`,
 * `ui/compositions.ts`); nothing here touches the match.
 *
 * Emits: `keybindings-changed`.
 */
export class ControlsScene extends Phaser.Scene {
  private from: string | undefined;
  private page: Page = 'keys';
  private content!: Phaser.GameObjects.Container;
  private pageTabs!: Record<Page, UiButton>;
  private info!: Phaser.GameObjects.Text;
  private resetLabel!: Phaser.GameObjects.Text;
  private rows: Row[] = [];
  private focus = 0;
  private focusFrame!: Phaser.GameObjects.Graphics;
  /** The action waiting for its new key, and whether the key is added rather than replacing. */
  private capturing: { id: KeyActionId; add: boolean } | null = null;
  /** The army the Armies page's keys edit. */
  private army = 0;

  constructor() {
    super({ key: SCENE_KEYS.controls });
  }

  init(data: ControlsSceneData = {}): void {
    this.from = data.from;
    this.page = 'keys';
    this.rows = [];
    this.focus = 0;
    this.capturing = null;
    this.army = 0;
  }

  create(): void {
    setKeysSuspended(true);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0).setInteractive();
    addThemedPanel(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, PANEL_W, PANEL_H, { alpha: 0.98 });
    this.add
      .text(GAME_WIDTH / 2, TOP + 34, 'CONTROLS', {
        fontFamily: UI_TITLE_FONT,
        fontSize: '34px',
        color: UiTextColors.gold,
        stroke: UiTextColors.stroke,
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.pageTabs = {
      keys: this.pageTab(GAME_WIDTH / 2 - 70, 'Keys', 'keys'),
      armies: this.pageTab(GAME_WIDTH / 2 + 70, 'Armies', 'armies'),
    };
    this.content = this.add.container(0, 0);
    this.focusFrame = this.add.graphics().setDepth(10);
    this.info = this.add.text(LEFT + 30, TOP + PANEL_H - 52, '', text(13, UiTextColors.dim)).setOrigin(0, 0.5);

    const reset = new UiButton(this, LEFT + PANEL_W - 300, TOP + PANEL_H - 44, 150, 38, {
      onPress: () => (this.page === 'keys' ? this.resetKeys() : this.resetArmies()),
      tint: UiColors.panelDark,
      framed: true,
    });
    this.resetLabel = this.add.text(0, 0, '', text(15, UiTextColors.parchment, '600')).setOrigin(0.5);
    reset.add(this.resetLabel);
    const done = new UiButton(this, LEFT + PANEL_W - 120, TOP + PANEL_H - 44, 150, 38, { onPress: () => this.close(), framed: true });
    done.add(this.add.text(0, 0, 'Done', { fontFamily: UI_TITLE_FONT, fontSize: '20px', color: UiTextColors.parchment }).setOrigin(0.5));

    window.addEventListener('keydown', this.onKey, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.onKey, true);
      setKeysSuspended(false);
    });
    this.showPage('keys');
  }

  private pageTab(x: number, label: string, page: Page): UiButton {
    const tab = new UiButton(this, x, TOP + 76, 130, 30, { onPress: () => this.showPage(page), tint: UiColors.panelDark });
    tab.add(this.add.text(0, 0, label, text(15, UiTextColors.parchment, '600')).setOrigin(0.5));
    return tab;
  }

  private showPage(page: Page): void {
    this.page = page;
    this.capturing = null;
    this.pageTabs.keys.setSelected(page === 'keys');
    this.pageTabs.armies.setSelected(page === 'armies');
    this.resetLabel.setText(page === 'keys' ? 'Reset keys' : 'Reset armies');
    this.rebuild();
  }

  private rebuild(): void {
    this.content.removeAll(true);
    this.rows = [];
    if (this.page === 'keys') this.buildKeys();
    else this.buildArmies();
    this.focus = Math.min(this.focus, Math.max(0, this.rows.length - 1));
    this.drawFocus();
  }

  /* ---- Keys page ------------------------------------------------------------------------------ */

  private buildKeys(): void {
    const actions = KEY_ACTIONS.filter((a) => actionAvailable(a) && a.group !== 'Armies');
    const groups: { name: string; actions: KeyAction[] }[] = [];
    for (const action of actions) {
      const group = groups.find((g) => g.name === action.group);
      if (group) group.actions.push(action);
      else groups.push({ name: action.group, actions: [action] });
    }
    let column = 0;
    let y = LIST_TOP;
    for (const group of groups) {
      const height = HEADER_H + group.actions.length * ROW_H;
      if (y + height > LIST_BOTTOM && y > LIST_TOP) {
        column++;
        y = LIST_TOP;
      }
      const x = LEFT + 30 + column * (COLUMN_W + 18);
      this.content.add(this.add.text(x, y + 10, group.name, text(14, UiTextColors.gold, '600')).setOrigin(0, 0.5));
      y += HEADER_H;
      for (const action of group.actions) {
        this.keyRow(action, x, y + ROW_H / 2, column);
        y += ROW_H;
      }
    }
  }

  private keyRow(action: KeyAction, x: number, y: number, column: number): void {
    const conflicts = conflictsOf(action.id);
    this.content.add(this.add.text(x, y, action.label, text(13, UiTextColors.parchment)).setOrigin(0, 0.5));
    const waiting = this.capturing?.id === action.id;
    const button = this.bindingButton(x + COLUMN_W - 80, y, 150, action.id, waiting, conflicts.length > 0);
    this.rows.push({ column, button, activate: (add) => this.capture(action.id, add), action: action.id });
  }

  /** A button showing an action's keys; click (Shift: add) to rebind. */
  private bindingButton(x: number, y: number, width: number, id: KeyActionId, waiting: boolean, conflict: boolean): UiButton {
    const button = new UiButton(this, x, y, width, ROW_H - 2, {
      onPress: (modifiers) => this.capture(id, modifiers.shift),
      tint: waiting ? UiColors.ready : UiColors.panelMid,
      onHover: (over) => this.explain(over ? id : null),
    });
    const label = waiting ? 'Press a key...' : bindingsLabel(id);
    const color = waiting ? '#fff6de' : conflict ? '#f08a80' : UiTextColors.parchment;
    button.add(this.add.text(0, 0, label, text(12, color, '600')).setOrigin(0.5));
    this.content.add(button.container);
    return button;
  }

  /** Help line: what a binding clashes with, or how rebinding works. */
  private explain(id: KeyActionId | null): void {
    if (this.capturing) {
      this.info.setText(`Press the new key for "${getKeyAction(this.capturing.id).label}"${this.capturing.add ? ' (added to its keys)' : ''}. Esc cancels.`);
      return;
    }
    const conflicts = id ? conflictsOf(id) : [];
    if (id && conflicts.length > 0) {
      this.info.setText(`${bindingsLabel(id)} also triggers: ${conflicts.map((c) => getKeyAction(c).label).join(', ')}`).setColor('#f08a80');
      return;
    }
    this.info
      .setText(
        this.page === 'keys'
          ? 'Click a key (or Enter) and press the new one; Shift adds a key instead. Arrows move, Tab: Armies page, Esc closes.'
          : 'Add units by slot in any order and amount. Queuing stops at the first unit you can\'t afford or a full queue. 1-5 add, Backspace undoes.',
      )
      .setColor(UiTextColors.dim);
  }

  private capture(id: KeyActionId, add: boolean): void {
    this.capturing = { id, add };
    this.rebuild();
    this.explain(id);
  }

  private resetKeys(): void {
    resetBindings();
    this.capturing = null;
    this.rebuild();
    this.explain(null);
  }

  /* ---- Armies page ---------------------------------------------------------------------------- */

  private buildArmies(): void {
    for (let i = 0; i < ARMY_COUNT; i++) this.armyRow(i, LIST_TOP + i * ARMY_ROW_H);
  }

  private armyRow(index: number, top: number): void {
    const army = getArmy(index);
    const x = LEFT + 30;
    const cy = top + ARMY_ROW_H / 2 - 4;
    const selected = index === this.army;
    this.content.add([
      this.add.text(x, cy - 10, `Army ${index + 1}`, text(16, selected ? UiTextColors.gold : UiTextColors.parchment, '600')).setOrigin(0, 0.5),
      this.add.text(x + 96, cy - 10, armyLabel(army), text(13, army.length > 0 ? UiTextColors.parchment : UiTextColors.dim)).setOrigin(0, 0.5),
      this.add.text(x + 96, cy + 10, army.length > 0 ? `${unitCount(army)} units` : '', text(11, UiTextColors.dim)).setOrigin(0, 0.5),
    ]);
    const queueId: KeyActionId = `army-${index + 1}`;
    const saveId: KeyActionId = `army-save-${index + 1}`;
    this.content.add(this.add.text(x, cy + 10, 'queue', text(11, UiTextColors.dim)).setOrigin(0, 0.5));
    const queueKey = this.bindingButton(x + 62, cy + 10, 44, queueId, this.capturing?.id === queueId, conflictsOf(queueId).length > 0);
    this.rows.push({ column: 0, button: queueKey, activate: (add) => this.capture(queueId, add) });
    const saveX = LEFT + 520;
    this.content.add(this.add.text(saveX - 10, cy - 10, 'save the queue as this army', text(11, UiTextColors.dim)).setOrigin(0, 0.5));
    const saveKey = this.bindingButton(saveX + 64, cy + 10, 148, saveId, this.capturing?.id === saveId, conflictsOf(saveId).length > 0);
    this.rows.push({ column: 1, button: saveKey, activate: (add) => this.capture(saveId, add) });

    const edit = (next: ReturnType<typeof getArmy>): void => {
      setArmy(index, next);
      this.army = index;
      this.rebuild();
    };
    let bx = LEFT + 716;
    SLOTS.forEach((slot) => {
      const add = new UiButton(this, bx + 32, cy, 64, 32, { onPress: () => edit(withUnit(getArmy(index), slot)), tint: UiColors.panelMid });
      add.add(this.add.text(0, -6, `+${SLOT_ROLES[slot]}`, text(11, UiTextColors.parchment, '600')).setOrigin(0.5));
      add.add(this.add.text(0, 8, `slot ${slot}`, text(10, UiTextColors.dim)).setOrigin(0.5));
      this.content.add(add.container);
      this.rows.push({ column: 2 + SLOTS.indexOf(slot), button: add, activate: () => edit(withUnit(getArmy(index), slot)) });
      bx += 68;
    });
    const undo = new UiButton(this, bx + 26, cy, 52, 32, { onPress: () => edit(withoutLastUnit(getArmy(index))), tint: UiColors.panelDark });
    undo.add(this.add.text(0, 0, 'Undo', text(12, UiTextColors.parchment)).setOrigin(0.5));
    const clear = new UiButton(this, bx + 84, cy, 52, 32, { onPress: () => edit([]), tint: UiColors.panelDark });
    clear.add(this.add.text(0, 0, 'Clear', text(12, UiTextColors.parchment)).setOrigin(0.5));
    this.content.add([undo.container, clear.container]);
    this.rows.push({ column: 7, button: undo, activate: () => edit(withoutLastUnit(getArmy(index))) });
    this.rows.push({ column: 8, button: clear, activate: () => edit([]) });
  }

  private resetArmies(): void {
    for (let i = 0; i < ARMY_COUNT; i++) setArmy(i, []);
    for (let i = 0; i < ARMY_COUNT; i++) {
      setBindings(`army-${i + 1}`, getKeyAction(`army-${i + 1}`).defaults);
      setBindings(`army-save-${i + 1}`, getKeyAction(`army-save-${i + 1}`).defaults);
    }
    this.rebuild();
  }

  /* ---- Keyboard ------------------------------------------------------------------------------- */

  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.sys.isActive()) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.capturing) {
      if (event.code === 'Escape') {
        this.capturing = null;
        this.rebuild();
        this.explain(null);
        return;
      }
      const combo = comboFromEvent(event);
      if (!combo) return;
      const { id, add } = this.capturing;
      const kept = add ? bindingsFor(id).filter((c) => comboLabel(c) !== comboLabel(combo)) : [];
      setBindings(id, [...kept, combo]);
      this.capturing = null;
      this.rebuild();
      this.explain(id);
      return;
    }
    if (event.repeat) return;
    switch (event.code) {
      case 'Escape':
        this.close();
        return;
      case 'Tab':
        this.showPage(this.page === 'keys' ? 'armies' : 'keys');
        return;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        this.rows[this.focus]?.activate(event.shiftKey);
        return;
      case 'ArrowDown':
      case 'ArrowUp':
        this.moveFocus(event.code === 'ArrowDown' ? 1 : -1, 'row');
        return;
      case 'ArrowLeft':
      case 'ArrowRight':
        this.moveFocus(event.code === 'ArrowRight' ? 1 : -1, 'column');
        return;
    }
    if (this.page === 'armies') {
      const slot = Number(event.code.replace('Digit', '').replace('Numpad', ''));
      if (event.code.match(/^(Digit|Numpad)[1-5]$/)) {
        setArmy(this.army, withUnit(getArmy(this.army), slot as UnitSlot));
        this.rebuild();
      } else if (event.code === 'Backspace') {
        setArmy(this.army, withoutLastUnit(getArmy(this.army)));
        this.rebuild();
      } else if (event.code === 'Delete') {
        setArmy(this.army, []);
        this.rebuild();
      }
    }
  };

  /** Arrows: up/down through the list (keys) or the armies; left/right across columns. */
  private moveFocus(by: number, axis: 'row' | 'column'): void {
    if (this.rows.length === 0) return;
    const current = this.rows[this.focus];
    if (!current) return;
    if (this.page === 'armies') {
      const perArmy = this.rows.length / ARMY_COUNT;
      const inRow = this.focus % perArmy;
      if (axis === 'row') this.army = Phaser.Math.Clamp(this.army + by, 0, ARMY_COUNT - 1);
      const col = axis === 'column' ? Phaser.Math.Clamp(inRow + by, 0, perArmy - 1) : inRow;
      this.focus = this.army * perArmy + col;
      this.rebuild();
      return;
    }
    if (axis === 'row') {
      this.focus = Phaser.Math.Clamp(this.focus + by, 0, this.rows.length - 1);
    } else {
      // The row at the same height in the next column over.
      const y = current.button.container.y;
      const candidates = this.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.column === current.column + by);
      const best = candidates.sort((a, b) => Math.abs(a.r.button.container.y - y) - Math.abs(b.r.button.container.y - y))[0];
      if (best) this.focus = best.i;
    }
    this.drawFocus();
  }

  private drawFocus(): void {
    this.focusFrame.clear();
    const row = this.rows[this.focus];
    if (!row) return;
    const bounds = row.button.background.getBounds();
    this.focusFrame.lineStyle(2, UiColors.gold, 1).strokeRoundedRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6, 5);
    if (!this.capturing) this.explain(row.action ?? null);
  }

  private close(): void {
    emit(Events.KeybindingsChanged, {});
    if (this.from) this.scene.resume(this.from);
    this.scene.stop();
  }
}
