import Phaser from 'phaser';
import {
  getKeyAction,
  KEY_ACTIONS,
  type KeyAction,
  type KeyActionId,
  type KeyCombo,
  type KeyContext,
} from '@config/keybindings.config';
import { modifiersOf, type PressModifiers } from '@ui/UiButton';

/**
 * The player's key bindings (defaults in `config/keybindings.config.ts`,
 * changes kept per browser) and `KeyboardControls`, which turns key presses
 * into actions for a scene. UI preferences only: nothing here touches the
 * match state.
 */

const STORAGE_KEY = 'aow-keybindings';

type Overrides = Partial<Record<KeyActionId, KeyCombo[]>>;

function isCombo(value: unknown): value is KeyCombo {
  return typeof value === 'object' && value !== null && typeof (value as KeyCombo).code === 'string';
}

function loadOverrides(): Overrides {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const overrides: Overrides = {};
    for (const action of KEY_ACTIONS) {
      const combos = parsed[action.id];
      if (Array.isArray(combos) && combos.every(isCombo)) {
        overrides[action.id] = combos.map((c) => ({ code: c.code, ...(c.shift ? { shift: true } : {}), ...(c.ctrl ? { ctrl: true } : {}) }));
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

let overrides: Overrides = loadOverrides();

function saveOverrides(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage can be unavailable; the bindings then last until reload.
  }
}

/** The keys bound to an action right now. */
export function bindingsFor(id: KeyActionId): readonly KeyCombo[] {
  return overrides[id] ?? getKeyAction(id).defaults;
}

/** Replaces an action's keys (an empty list unbinds it). */
export function setBindings(id: KeyActionId, combos: readonly KeyCombo[]): void {
  overrides = { ...overrides, [id]: [...combos] };
  saveOverrides();
}

export function resetBindings(): void {
  overrides = {};
  saveOverrides();
}

/** Dev actions only exist in dev builds. */
export function actionAvailable(action: KeyAction): boolean {
  return !action.dev || import.meta.env.DEV;
}

/* ---- Labels ---------------------------------------------------------------------------------- */

const CODE_LABELS: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backspace: 'Bksp',
  Delete: 'Del',
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Insert: 'Ins',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

/** What the player's keyboard prints on a key, when the browser can tell (Chrome). */
const layoutLabels = new Map<string, string>();

interface KeyboardLayoutApi {
  keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
}

/** Learns the keyboard layout's letters (so an AZERTY player sees their own keys). */
export function loadLayoutLabels(): Promise<void> {
  const api = (navigator as Navigator & KeyboardLayoutApi).keyboard;
  if (!api?.getLayoutMap) return Promise.resolve();
  return api
    .getLayoutMap()
    .then((map) => map.forEach((value, code) => layoutLabels.set(code, value.toUpperCase())))
    .catch(() => undefined);
}

export function codeLabel(code: string): string {
  const layout = layoutLabels.get(code);
  if (layout && (code.startsWith('Key') || code.startsWith('Digit'))) return layout;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`;
  return CODE_LABELS[code] ?? code;
}

export function comboLabel(combo: KeyCombo): string {
  return [combo.ctrl ? 'Ctrl' : '', combo.shift ? 'Shift' : '', codeLabel(combo.code)].filter(Boolean).join('+');
}

/** An action's first key, for button corners ('' when unbound). */
export function keyHint(id: KeyActionId): string {
  const first = bindingsFor(id)[0];
  return first ? comboLabel(first) : '';
}

/** Every key of an action, "P / Esc" (a dash when unbound). */
export function bindingsLabel(id: KeyActionId): string {
  const labels = bindingsFor(id).map(comboLabel);
  return labels.length > 0 ? labels.join(' / ') : '—';
}

/* ---- Matching and conflicts -------------------------------------------------------------------- */

/** Whether two contexts can be live at the same time without one of them winning (a popup always wins). */
function contextsOverlap(a: KeyContext, b: KeyContext): boolean {
  if (a === b) return true;
  if (a === 'popup' || b === 'popup') return false;
  if (a === 'always' || b === 'always') return true;
  if (a === 'overlay' || b === 'overlay') return false;
  return a === 'battle' || b === 'battle';
}

function sameKey(a: KeyCombo, aAction: KeyAction, b: KeyCombo, bAction: KeyAction): boolean {
  if (a.code !== b.code) return false;
  const aAny = aAction.passModifiers && !a.shift && !a.ctrl;
  const bAny = bAction.passModifiers && !b.shift && !b.ctrl;
  if (aAny || bAny) return true;
  return Boolean(a.shift) === Boolean(b.shift) && Boolean(a.ctrl) === Boolean(b.ctrl);
}

/** Other actions that a key of `id` would also trigger in the same situation. */
export function conflictsOf(id: KeyActionId): KeyActionId[] {
  const action = getKeyAction(id);
  const found: KeyActionId[] = [];
  for (const other of KEY_ACTIONS) {
    if (other.id === id || !actionAvailable(other) || !contextsOverlap(action.context, other.context)) continue;
    const clash = bindingsFor(id).some((a) => bindingsFor(other.id).some((b) => sameKey(a, action, b, other)));
    if (clash) found.push(other.id);
  }
  return found;
}

function matches(combo: KeyCombo, event: KeyboardEvent, passModifiers: boolean): boolean {
  if (combo.code !== event.code) return false;
  const { shift, ctrl } = modifiersOf(event);
  if (passModifiers) return (!combo.shift || shift) && (!combo.ctrl || ctrl);
  return Boolean(combo.shift) === shift && Boolean(combo.ctrl) === ctrl;
}

/** The key combination of a key press (for rebinding), or null for a lone modifier. */
export function comboFromEvent(event: KeyboardEvent): KeyCombo | null {
  if (/^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/.test(event.code) || event.code === '') return null;
  const { shift, ctrl } = modifiersOf(event);
  return { code: event.code, ...(shift ? { shift: true } : {}), ...(ctrl ? { ctrl: true } : {}) };
}

/* ---- Suspending (while rebinding) ------------------------------------------------------------ */

let suspended = false;

/** The Controls screen suspends every scene's keys while it is open. */
export function setKeysSuspended(value: boolean): void {
  suspended = value;
}

/* ---- KeyboardControls -------------------------------------------------------------------------- */

/** Returns false when it didn't act, so another binding of the key may. */
export type KeyHandler = (modifiers: PressModifiers) => boolean | void;

/**
 * Key presses to actions for one scene. The scene registers a handler per
 * action and says which contexts are live, most important first; a press
 * runs the first matching handler (exact modifiers before keys that pass
 * modifiers on) and stops the browser's own use of the key. Listens on the
 * window, so it can stop Tab or F5 in time, and only while its scene runs.
 * Held actions (camera) are read with `isHeld`. Auto-repeat is ignored.
 */
export class KeyboardControls {
  private readonly scene: Phaser.Scene;
  private readonly contexts: () => readonly KeyContext[];
  private readonly handlers = new Map<KeyActionId, KeyHandler>();
  private readonly held = new Set<string>();

  constructor(scene: Phaser.Scene, contexts: () => readonly KeyContext[]) {
    this.scene = scene;
    this.contexts = contexts;
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  on(id: KeyActionId, handler: KeyHandler): this {
    this.handlers.set(id, handler);
    return this;
  }

  /** Whether any key of a held action is down. */
  isHeld(id: KeyActionId): boolean {
    if (suspended) return false;
    return bindingsFor(id).some((combo) => this.held.has(combo.code));
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
    this.handlers.clear();
    this.held.clear();
  }

  private readonly onDown = (event: KeyboardEvent): void => {
    this.held.add(event.code);
    if (suspended || event.repeat || event.altKey || !this.scene.sys.isActive()) return;
    for (const context of this.contexts()) {
      for (const pass of [false, true]) {
        for (const [id, handler] of this.handlers) {
          const action = getKeyAction(id);
          if (action.context !== context || action.held || Boolean(action.passModifiers) !== pass || !actionAvailable(action)) continue;
          if (!bindingsFor(id).some((combo) => matches(combo, event, pass))) continue;
          if (handler(modifiersOf(event)) === false) continue;
          event.preventDefault();
          return;
        }
      }
    }
  };

  private readonly onUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onBlur = (): void => this.held.clear();
}
