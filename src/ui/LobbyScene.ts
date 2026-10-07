import Phaser from 'phaser';
import { AGE_COUNT, getAge } from '@config/ages.config';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '@config/constants';
import { featureSnapshot } from '@config/features.config';
import { inputDelayFor, LOBBY_PINGS, RELAY_PORT } from '@config/multiplayer.config';
import type { GameSceneData } from '@/scenes/GameScene';
import { PROTOCOL_VERSION, type MatchSetup, type NetMessage } from '@net/protocol';
import { RelayClient, type LinkStatus } from '@net/RelayClient';
import { loadAccount, lockedPartKeys } from '@state/accountProgress';
import { addThemedPanel, applyUiTheme, UI_FONT, UI_TITLE_FONT, UiColors, UiTextColors } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import { randomSeed } from '@utils/Rng';

/** 'duel' is the Mech Arena (GAME_DESIGN 15), the lobby's "Mech" mode. */
type Mode = 'battle' | 'duel';

/** Dev-only handles for the browser checks. */
type LobbyWindow = Window & { __aowLobby?: { step: string; code: string; note: string; mode: Mode }; __aowNet?: RelayClient };

/** Where the lobby is. */
type Step =
  | 'choose'
  | 'connecting'
  /** Host: room open, waiting for the guest. */
  | 'hosting'
  /** Guest: typing the room code. */
  | 'entering'
  | 'joining'
  /** Waiting on the other player (their hello or the setup). */
  | 'waiting'
  | 'starting'
  | 'error';

const CODE_LENGTH = 4;
const PING_TIMEOUT_MS = 2000;

/**
 * Online lobby (Phase 22 step 3). The host opens a room on the relay and
 * gets a 4-letter code; the guest types it. Then:
 *
 * 1. the guest says hello (its build version and its Mech locks);
 * 2. the host sends its choice (a normal battle, or the Mech Arena and its
 *    age; the arena's Mechs are built in the match's hangar phase);
 * 3. the host pings the guest a few times and picks the input delay from the
 *    round trip (`inputDelayFor`);
 * 4. the host sends the `MatchSetup` and both start the match from it: the
 *    host plays the left side, the guest the right.
 *
 * The RelayClient goes on into the match as its transport.
 */
export class LobbyScene extends Phaser.Scene {
  private step: Step = 'choose';
  private mode: Mode = 'battle';
  private age = 0;
  private code = '';
  private client: RelayClient | null = null;
  private note = '';
  private guestLocks: string[] = [];
  private roundTripMs = 0;
  private pongs = new Map<number, (ms: number) => void>();
  private cleanups: (() => void)[] = [];
  private view!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: SCENE_KEYS.lobby });
  }

  init(): void {
    this.step = 'choose';
    this.mode = 'battle';
    this.age = 0;
    this.code = '';
    this.client = null;
    this.note = '';
    this.guestLocks = [];
    this.roundTripMs = 0;
    this.pongs = new Map();
    this.cleanups = [];
  }

  create(): void {
    applyUiTheme(0);
    this.cameras.main.setBackgroundColor(0x1d1a26);
    this.view = this.add.container(0, 0);
    // The browser's own key events: Phaser's per-frame key queue garbled a
    // room code typed quickly (two keys in one frame).
    const onKey = (event: KeyboardEvent): void => this.onKey(event);
    window.addEventListener('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKey);
      for (const off of this.cleanups) off();
      this.cleanups = [];
    });
    this.render();
  }

  /* ---- Steps ---------------------------------------------------------------------------- */

  private async host(): Promise<void> {
    this.go('connecting');
    const client = this.connect();
    try {
      this.code = await client.host();
      this.go('hosting');
    } catch (error) {
      this.fail(error);
    }
  }

  private async join(): Promise<void> {
    if (this.code.length !== CODE_LENGTH) return;
    this.go('joining');
    const client = this.connect();
    try {
      await client.join(this.code);
      client.send({ kind: 'hello', version: PROTOCOL_VERSION, mechLocked: lockedPartKeys(loadAccount()) });
      this.note = 'Waiting for the host to start...';
      this.go('waiting');
    } catch (error) {
      this.fail(error);
    }
  }

  private connect(): RelayClient {
    const client = new RelayClient(relayUrl());
    this.client = client;
    this.cleanups.push(
      client.onMessage((message) => this.onMessage(message)),
      client.onStatus((status) => this.onStatus(status)),
    );
    return client;
  }

  private onMessage(message: NetMessage): void {
    const client = this.client;
    if (!client) return;
    switch (message.kind) {
      // Host side.
      case 'hello':
        if (message.version !== PROTOCOL_VERSION) {
          this.fail(new Error('version'));
          return;
        }
        this.guestLocks = message.mechLocked;
        client.send({ kind: 'lobby', mode: this.mode, age: this.age });
        void this.startAsHost();
        return;
      case 'pong':
        this.pongs.get(message.id)?.(performance.now());
        return;
      // Guest side.
      case 'lobby':
        this.mode = message.mode;
        this.age = message.age;
        this.render();
        return;
      case 'ping':
        client.send({ kind: 'pong', id: message.id });
        return;
      case 'setup':
        this.start(message.setup);
        return;
      default:
        return;
    }
  }

  private onStatus(status: LinkStatus): void {
    if (this.step === 'starting') return;
    if (status === 'peer-joined') {
      this.note = 'Your opponent is in. Setting up...';
      this.go('waiting');
    } else if (status === 'peer-quit' || status === 'peer-left') {
      this.fail(new Error('peer-quit'));
    } else if (status === 'lost') {
      this.fail(new Error('relay-unreachable'));
    }
  }

  /** Host: measure the round trip, then send the setup and start. */
  private async startAsHost(): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.note = 'Measuring the connection...';
    this.go('waiting');
    const trips: number[] = [];
    for (let id = 1; id <= LOBBY_PINGS; id++) trips.push(await this.ping(id));
    trips.sort((a, b) => a - b);
    // A high-ish sample, so ordinary jitter doesn't make the game hitch.
    this.roundTripMs = trips[Math.min(trips.length - 1, Math.floor(trips.length * 0.75))] ?? PING_TIMEOUT_MS;
    const arena = this.mode === 'duel';
    const setup: MatchSetup = {
      seed: randomSeed(),
      inputDelayTurns: inputDelayFor(this.roundTripMs),
      features: featureSnapshot(),
      // Each player's own unlocks in a battle; every part open in the Mech Arena (owner, 2026-10-05).
      mechLocked: arena ? { player: [], enemy: [] } : { player: lockedPartKeys(loadAccount()), enemy: this.guestLocks },
      ...(arena ? { arena: { age: this.age } } : {}),
    };
    client.send({ kind: 'setup', setup });
    this.start(setup);
  }

  private ping(id: number): Promise<number> {
    return new Promise((resolve) => {
      const sentAt = performance.now();
      const timer = setTimeout(() => {
        this.pongs.delete(id);
        resolve(PING_TIMEOUT_MS);
      }, PING_TIMEOUT_MS);
      this.pongs.set(id, (at) => {
        clearTimeout(timer);
        this.pongs.delete(id);
        resolve(at - sentAt);
      });
      this.client?.send({ kind: 'ping', id });
    });
  }

  private start(setup: MatchSetup): void {
    const client = this.client;
    if (!client || this.step === 'starting') return;
    this.go('starting');
    // The match takes over the link: stop listening here (messages wait for the match).
    for (const off of this.cleanups) off();
    this.cleanups = [];
    this.client = null;
    if (import.meta.env.DEV) (window as LobbyWindow).__aowNet = client;
    this.scene.start(SCENE_KEYS.game, {
      lockstep: {
        setup,
        localSide: client.side,
        transport: client,
        link: client,
        opponent: client.side === 'player' ? 'Online · guest' : 'Online · host',
      },
    } satisfies GameSceneData);
  }

  private leave(): void {
    this.client?.close();
    this.client = null;
    this.scene.start(SCENE_KEYS.menu);
  }

  private fail(error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    const why: Record<string, string> = {
      'relay-unreachable': import.meta.env.DEV
        ? `Can't reach the relay at ${relayUrl()}.\nStart it with "npm run relay" on the host's PC.`
        : `Can't reach the relay at ${relayUrl()}.`,
      'no-room': `There is no room ${this.code}.`,
      full: `Room ${this.code} already has two players.`,
      'peer-quit': 'Your opponent left.',
      version: 'You and your opponent run different versions of the game.',
    };
    this.note = why[reason] ?? `Something went wrong (${reason}).`;
    this.client?.close();
    this.client = null;
    this.go('error');
  }

  private go(step: Step): void {
    this.step = step;
    this.render();
  }

  /* ---- Input -------------------------------------------------------------------------- */

  private onKey(event: KeyboardEvent): void {
    if (this.step === 'starting') return;
    const key = event.key;
    if (key === 'Escape') {
      if (this.step === 'entering') this.go('choose');
      else this.leave();
      return;
    }
    switch (this.step) {
      case 'choose':
        if (key === 'h' || key === 'H') void this.host();
        else if (key === 'j' || key === 'J') this.enterCode();
        else if (key === 'm' || key === 'M') this.toggleMode();
        else if (key === 'ArrowLeft') this.shiftAge(-1);
        else if (key === 'ArrowRight') this.shiftAge(1);
        return;
      case 'entering':
        if (key === 'Backspace') this.code = this.code.slice(0, -1);
        else if (key === 'Enter') void this.join();
        else if (/^[a-zA-Z]$/.test(key) && this.code.length < CODE_LENGTH) this.code += key.toUpperCase();
        this.render();
        return;
      case 'error':
        if (key === 'Enter') this.go('choose');
        return;
      default:
        return;
    }
  }

  /** Join: a fresh, empty code box (not the last code tried). */
  private enterCode(): void {
    this.code = '';
    this.go('entering');
  }

  private toggleMode(): void {
    this.mode = this.mode === 'battle' ? 'duel' : 'battle';
    this.render();
  }

  private shiftAge(by: number): void {
    if (this.mode !== 'duel') return;
    this.age = (this.age + by + AGE_COUNT) % AGE_COUNT;
    this.render();
  }

  /* ---- Drawing ------------------------------------------------------------------------ */

  private render(): void {
    // Dev: where the lobby is, for the browser checks (tools/checks/online.mjs).
    if (import.meta.env.DEV) (window as LobbyWindow).__aowLobby = { step: this.step, code: this.code, note: this.note, mode: this.mode };
    this.view.removeAll(true);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.view.add(addThemedPanel(this, cx, cy, 720, 460, { alpha: 0.97 }));
    this.view.add(
      this.add
        .text(cx, cy - 180, 'ONLINE', { fontFamily: UI_TITLE_FONT, fontSize: '54px', color: UiTextColors.title, stroke: UiTextColors.stroke, strokeThickness: 8 })
        .setOrigin(0.5),
    );
    const modeLabel = this.mode === 'battle' ? 'Battle' : `Mech arena · ${getAge(this.age).name} Age`;
    switch (this.step) {
      case 'choose':
        this.line(cy - 110, 'Host a room and send the code to a friend, or join theirs.');
        this.button(cx - 150, cy - 30, 240, 'HOST (H)', () => void this.host(), true);
        this.button(cx + 150, cy - 30, 240, 'JOIN (J)', () => this.enterCode());
        this.button(cx, cy + 60, 360, `Mode: ${modeLabel} (M)`, () => this.toggleMode());
        if (this.mode === 'duel') {
          this.button(cx - 230, cy + 60, 50, '<', () => this.shiftAge(-1));
          this.button(cx + 230, cy + 60, 50, '>', () => this.shiftAge(1));
        }
        this.line(cy + 130, 'The host picks the mode and plays the left side. Esc: back to the menu.', 14);
        break;
      case 'entering':
        this.line(cy - 110, 'Type the room code, then Enter.');
        this.big(cy - 20, (this.code + '_'.repeat(CODE_LENGTH - this.code.length)).split('').join(' '));
        this.button(cx, cy + 80, 220, 'JOIN (Enter)', () => void this.join(), this.code.length === CODE_LENGTH);
        break;
      case 'hosting':
        this.line(cy - 110, `Room code (${modeLabel}). Send it to your opponent:`);
        this.big(cy - 20, this.code.split('').join(' '));
        this.line(cy + 70, 'Waiting for your opponent to join...');
        break;
      case 'connecting':
      case 'joining':
        this.line(cy - 20, 'Connecting...');
        break;
      case 'waiting':
      case 'starting':
        if (this.code) this.line(cy - 110, `Room ${this.code} · ${modeLabel}`);
        this.line(cy - 20, this.step === 'starting' ? 'Starting...' : this.note);
        break;
      case 'error':
        this.line(cy - 30, this.note);
        this.button(cx, cy + 80, 220, 'OK (Enter)', () => this.go('choose'));
        break;
    }
    if (this.step !== 'starting') this.button(cx, cy + 190, 200, 'Back (Esc)', () => (this.step === 'entering' ? this.go('choose') : this.leave()));
  }

  private line(y: number, text: string, size = 18): void {
    this.view.add(
      this.add
        .text(GAME_WIDTH / 2, y, text, { fontFamily: UI_FONT, fontSize: `${size}px`, color: UiTextColors.parchment, align: 'center', lineSpacing: 6 })
        .setOrigin(0.5),
    );
  }

  private big(y: number, text: string): void {
    this.view.add(
      this.add
        .text(GAME_WIDTH / 2, y, text, { fontFamily: UI_TITLE_FONT, fontSize: '72px', color: UiTextColors.gold, stroke: UiTextColors.stroke, strokeThickness: 8 })
        .setOrigin(0.5),
    );
  }

  private button(x: number, y: number, width: number, label: string, onPress: () => void, highlight = false): void {
    const button = new UiButton(this, x, y, width, 52, { onPress, framed: true, ...(highlight ? { tint: UiColors.ready } : {}) });
    button.add(
      this.add
        .text(0, 0, label, { fontFamily: UI_TITLE_FONT, fontSize: '22px', color: UiTextColors.parchment, stroke: UiTextColors.stroke, strokeThickness: 4 })
        .setOrigin(0.5),
    );
    this.view.add(button.container);
  }
}

/**
 * The relay: `?relay=ws://...`; else, in the hosted game, /relay on the
 * site itself (the Cloudflare Worker); in development the local relay
 * (`npm run relay`) on the machine the game came from.
 */
function relayUrl(): string {
  const param = new URLSearchParams(window.location.search).get('relay');
  if (param) return param;
  if (!import.meta.env.DEV) return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/relay`;
  return `ws://${window.location.hostname || 'localhost'}:${RELAY_PORT}/relay`;
}
