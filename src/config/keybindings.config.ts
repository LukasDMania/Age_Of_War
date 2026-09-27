/**
 * Keyboard play (owner, 2026-09-27: "fully playable by keyboard only and
 * mapable buttons"). Every in-battle action is listed here with its default
 * keys; players rebind them on the Controls screen (`ui/ControlsScene.ts`)
 * and their choices are kept per browser (`ui/keymap.ts`). Keys only press
 * the same buttons, so they emit the same `*-requested` events as clicks.
 *
 * Defaults keep the old keys (1-5, Tab, A, S, W, F, P, Esc, R, M,
 * Enter). Number keys act on the open tab. The camera no longer scrolls
 * with A/D (A also ages up): arrows only. The dev XP cheat moved from X
 * (now the Turrets tab) to H, and the background from B (now the Workshop
 * tab, 2026-09-27) to Y. All PROPOSED.
 */

/** A key and the modifiers it needs. `code` is `KeyboardEvent.code` (the key's place, not its letter). */
export interface KeyCombo {
  code: string;
  shift?: boolean;
  ctrl?: boolean;
}

/**
 * When an action can fire. `battle`: while a match is being played (HUD);
 * a tab's name: only with that tab open; `popup`: while a choice popup is
 * open (it wins over the rest); `always`: the game scene (pause, speed,
 * camera, even while paused); `overlay`: the pause and game-over panel.
 */
export type KeyContext = 'always' | 'battle' | 'units' | 'turrets' | 'buildings' | 'research' | 'workshop' | 'popup' | 'overlay';

const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'] as const;
const ARMY_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as const;

/** How many unit compositions ("armies") there are (see `ui/compositions.ts`). */
export const ARMY_COUNT = ARMY_KEYS.length;

export const KEY_ACTION_IDS = [
  'tab-next',
  'tab-prev',
  'tab-units',
  'tab-turrets',
  'tab-buildings',
  'tab-research',
  'tab-workshop',
  ...SLOT_KEYS.map((_, i) => `slot-${i + 1}` as const),
  'turret-build-1',
  'turret-build-2',
  'turret-build-3',
  'turret-upgrade',
  'turret-sell',
  'mech-prev',
  'mech-next',
  'mech-build',
  'age-up',
  'special',
  'war-cry',
  ...ARMY_KEYS.map((_, i) => `army-${i + 1}` as const),
  ...ARMY_KEYS.map((_, i) => `army-save-${i + 1}` as const),
  'choice-1',
  'choice-2',
  'choice-3',
  'pause',
  'speed',
  'background',
  'camera-left',
  'camera-right',
  'overlay-resume',
  'overlay-restart',
  'overlay-menu',
  'dev-gold',
  'dev-xp',
  'dev-age',
] as const;

export type KeyActionId = (typeof KEY_ACTION_IDS)[number];

export interface KeyAction {
  id: KeyActionId;
  label: string;
  /** Heading on the Controls screen. */
  group: string;
  context: KeyContext;
  defaults: readonly KeyCombo[];
  /**
   * Also fires with Shift or Ctrl held that the binding doesn't name, and
   * hands them to the handler (multi-buys: Shift+2 buys a stage of Library).
   */
  passModifiers?: boolean;
  /** Read while held down (camera scrolling), not on a press. */
  held?: boolean;
  /** Dev builds only. */
  dev?: boolean;
}

const key = (code: string, extra: Omit<KeyCombo, 'code'> = {}): KeyCombo => ({ code, ...extra });

export const KEY_ACTIONS: readonly KeyAction[] = [
  { id: 'tab-next', label: 'Next tab', group: 'Tabs', context: 'battle', defaults: [key('Tab')] },
  { id: 'tab-prev', label: 'Previous tab', group: 'Tabs', context: 'battle', defaults: [key('Tab', { shift: true })] },
  { id: 'tab-units', label: 'Units tab', group: 'Tabs', context: 'battle', defaults: [key('KeyZ')] },
  { id: 'tab-turrets', label: 'Turrets tab', group: 'Tabs', context: 'battle', defaults: [key('KeyX')] },
  { id: 'tab-buildings', label: 'Buildings tab', group: 'Tabs', context: 'battle', defaults: [key('KeyC')] },
  { id: 'tab-research', label: 'Research tab', group: 'Tabs', context: 'battle', defaults: [key('KeyV')] },
  { id: 'tab-workshop', label: 'Workshop tab (Mech)', group: 'Tabs', context: 'battle', defaults: [key('KeyB')] },
  ...SLOT_KEYS.map(
    (code, i): KeyAction => ({
      id: `slot-${i + 1}`,
      label: `Slot ${i + 1}`,
      group: 'Slots (on the open tab)',
      context: 'battle',
      defaults: [key(code)],
      passModifiers: true,
    }),
  ),
  { id: 'turret-build-1', label: 'Build 1st turret', group: 'Turrets (chosen slot)', context: 'turrets', defaults: [key('KeyQ')] },
  { id: 'turret-build-2', label: 'Build 2nd turret', group: 'Turrets (chosen slot)', context: 'turrets', defaults: [key('KeyE')] },
  { id: 'turret-build-3', label: 'Build 3rd turret', group: 'Turrets (chosen slot)', context: 'turrets', defaults: [key('KeyR')] },
  { id: 'turret-upgrade', label: 'Upgrade / unlock', group: 'Turrets (chosen slot)', context: 'turrets', defaults: [key('KeyU')] },
  { id: 'turret-sell', label: 'Sell', group: 'Turrets (chosen slot)', context: 'turrets', defaults: [key('Delete'), key('Backspace')] },
  // Workshop: 1-5 pick the part slot (legs, torso, head, left arm, right arm).
  { id: 'mech-prev', label: 'Previous part', group: 'Workshop (chosen part)', context: 'workshop', defaults: [key('KeyQ')] },
  { id: 'mech-next', label: 'Next part', group: 'Workshop (chosen part)', context: 'workshop', defaults: [key('KeyE')] },
  { id: 'mech-build', label: 'Build the Mech', group: 'Workshop (chosen part)', context: 'workshop', defaults: [key('KeyR')] },
  { id: 'age-up', label: 'Age up', group: 'Abilities', context: 'battle', defaults: [key('KeyA')] },
  { id: 'special', label: 'Special', group: 'Abilities', context: 'battle', defaults: [key('KeyS')] },
  { id: 'war-cry', label: 'War Cry', group: 'Abilities', context: 'battle', defaults: [key('KeyW')] },
  ...ARMY_KEYS.map(
    (code, i): KeyAction => ({ id: `army-${i + 1}`, label: `Queue army ${i + 1}`, group: 'Armies', context: 'battle', defaults: [key(code)] }),
  ),
  ...ARMY_KEYS.map(
    (code, i): KeyAction => ({
      id: `army-save-${i + 1}`,
      label: `Save queue as army ${i + 1}`,
      group: 'Armies',
      context: 'battle',
      defaults: [key(code, { ctrl: true, shift: true })],
    }),
  ),
  // Doctrine and building-perk popups (prototypes); 7-9 so they don't take 1-5 while a popup waits.
  { id: 'choice-1', label: 'Popup choice 1', group: 'Popups', context: 'popup', defaults: [key('Digit7')] },
  { id: 'choice-2', label: 'Popup choice 2', group: 'Popups', context: 'popup', defaults: [key('Digit8')] },
  { id: 'choice-3', label: 'Popup choice 3', group: 'Popups', context: 'popup', defaults: [key('Digit9')] },
  { id: 'pause', label: 'Pause / resume', group: 'Game', context: 'always', defaults: [key('KeyP'), key('Escape')] },
  { id: 'speed', label: 'Game speed', group: 'Game', context: 'always', defaults: [key('KeyF')] },
  { id: 'background', label: 'Next background', group: 'Game', context: 'always', defaults: [key('KeyY')] },
  { id: 'camera-left', label: 'Scroll left', group: 'Game', context: 'always', defaults: [key('ArrowLeft')], held: true },
  { id: 'camera-right', label: 'Scroll right', group: 'Game', context: 'always', defaults: [key('ArrowRight')], held: true },
  { id: 'overlay-resume', label: 'Resume / play again', group: 'Pause and game over', context: 'overlay', defaults: [key('Enter')] },
  { id: 'overlay-restart', label: 'Restart', group: 'Pause and game over', context: 'overlay', defaults: [key('KeyR')] },
  { id: 'overlay-menu', label: 'Main menu', group: 'Pause and game over', context: 'overlay', defaults: [key('KeyM')] },
  { id: 'dev-gold', label: 'Cheat: +gold', group: 'Dev', context: 'always', defaults: [key('KeyG')], dev: true },
  { id: 'dev-xp', label: 'Cheat: +XP', group: 'Dev', context: 'always', defaults: [key('KeyH')], dev: true },
  { id: 'dev-age', label: 'Cheat: age up', group: 'Dev', context: 'always', defaults: [key('KeyN')], dev: true },
];

export function getKeyAction(id: KeyActionId): KeyAction {
  const action = KEY_ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error(`Unknown key action: ${id}`);
  return action;
}
