import { RECONNECT_WINDOW_MS } from '@config/multiplayer.config';
import type { NetMessage } from '@net/protocol';
import type { Transport } from '@net/transport';
import type { Side } from '@state/types';

/** What the connection is doing, for the lobby and the match. */
export type LinkStatus =
  /** The other player arrived (host). */
  | 'peer-joined'
  /** The other player's connection dropped; the relay holds their seat. */
  | 'peer-left'
  | 'peer-back'
  /** The other player quit (or left the lobby). */
  | 'peer-quit'
  /** Our connection dropped; trying to get back in. */
  | 'reconnecting'
  | 'reconnected'
  /** Gave up getting back in (`RECONNECT_WINDOW_MS`), or the relay can't be reached. */
  | 'lost';

/** Messages kept for a resend after a reconnect (about 2 minutes of turns). */
const KEEP_SENT = 4000;
const RETRY_MS = 1000;
/** Heartbeat to the relay (it drops a player silent for 10 s). */
const PING_MS = 2000;
/**
 * Nothing from the relay for this long (not even a heartbeat answer): our
 * network is gone even if the socket looks open, so reconnect.
 */
const SILENT_MS = 6000;
/** Tries at hosting when the hosted relay's random code is already a room. */
const HOST_ATTEMPTS = 5;

type RelayReply =
  | { relay: 'room' | 'joined'; code: string; side: Side; token: string }
  | { relay: 'rejoined'; side: Side; lastFrom: number }
  | { relay: 'peer-joined' | 'peer-left' | 'peer-back' | 'peer-quit' | 'pong' }
  | { relay: 'msg'; seq: number; data: NetMessage }
  | { relay: 'error'; reason: string };

/**
 * The link to the other player through the relay (`tools/relay`; Phase 22
 * step 3). A `Transport` for the lockstep match; the lobby also uses it for
 * hello, ping and setup.
 *
 * Messages are numbered both ways, so a dropped connection loses nothing:
 * it rejoins its seat with a token, the relay replays what it missed and
 * says which of ours it already has; the rest is sent again.
 */
export class RelayClient implements Transport {
  code = '';
  side: Side = 'player';

  private readonly url: string;
  private socket: WebSocket | null = null;
  private token = '';
  private sentSeq = 0;
  private readonly sent: { seq: number; data: NetMessage }[] = [];
  private lastSeen = 0;
  private readonly handlers = new Set<(message: NetMessage) => void>();
  /** Messages that came while nobody listened (between the lobby and the match): the next listener gets them. */
  private readonly unheard: NetMessage[] = [];
  private readonly statusHandlers = new Set<(status: LinkStatus) => void>();
  private closed = false;
  private lostAt = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  /** When the relay last said anything (or a new connection was tried), and the heartbeat timer. */
  private heardAt = 0;
  /** Seated and in step with the relay: new messages go out at once (false from a drop until `rejoined`). */
  private synced = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(url: string) {
    this.url = url;
  }

  /** Opens a room; resolves with its code. */
  async host(): Promise<string> {
    // The hosted relay picks the code; on the rare clash with a live room, ask again.
    for (let attempt = 1; ; attempt++) {
      try {
        await this.open(this.address('host=1'), { relay: 'host' });
        return this.code;
      } catch (error) {
        if (!(error instanceof Error && error.message === 'taken') || attempt >= HOST_ATTEMPTS) throw error;
      }
    }
  }

  /** Joins room `code`; rejects with the relay's reason ('no-room', 'full'). */
  join(code: string): Promise<void> {
    const room = code.toUpperCase();
    return this.open(this.address(`code=${room}`), { relay: 'join', code: room });
  }

  send(message: NetMessage): void {
    if (this.closed) return;
    const entry = { seq: ++this.sentSeq, data: message };
    this.sent.push(entry);
    if (this.sent.length > KEEP_SENT) this.sent.splice(0, this.sent.length - KEEP_SENT);
    // While rejoining, hold it: `rejoined` resends everything the relay lacks, in order.
    if (this.synced) this.write({ relay: 'msg', ...entry });
  }

  onMessage(handler: (message: NetMessage) => void): () => void {
    this.handlers.add(handler);
    for (const message of this.unheard.splice(0)) handler(message);
    return () => this.handlers.delete(handler);
  }

  onStatus(handler: (status: LinkStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /** Dev and checks: drops the connection as a network failure would (it then rejoins). */
  dropForTest(): void {
    this.socket?.close();
  }

  /** Leaves the room for good (the other player is told) and closes. */
  close(): void {
    if (this.closed) return;
    this.write({ relay: 'leave' });
    this.closed = true;
    this.stopHeartbeat();
    if (this.retry) clearTimeout(this.retry);
    this.socket?.close();
    this.socket = null;
    this.handlers.clear();
    this.statusHandlers.clear();
  }

  /** First connection: resolves once the relay seats us. */
  /**
   * The relay URL for a connection. The hosted relay routes by it (a room
   * per code); the local one ignores the query.
   */
  private address(query: string): string {
    return `${this.url}${this.url.includes('?') ? '&' : '?'}${query}`;
  }

  private open(url: string, hello: object): Promise<void> {
    return new Promise((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.socket = socket;
      let seated = false;
      socket.onopen = () => socket.send(JSON.stringify(hello));
      socket.onerror = () => {
        if (!seated) reject(new Error('relay-unreachable'));
      };
      socket.onclose = () => {
        if (!seated) reject(new Error('relay-unreachable'));
        else this.dropped(socket);
      };
      socket.onmessage = (event) => {
        const reply = JSON.parse(String(event.data)) as RelayReply;
        if (!seated) {
          if (reply.relay === 'room' || reply.relay === 'joined') {
            seated = true;
            this.code = reply.code;
            this.side = reply.side;
            this.token = reply.token;
            this.synced = true;
            this.startHeartbeat();
            resolve();
          } else if (reply.relay === 'error') {
            reject(new Error(reply.reason));
            socket.close();
          }
          return;
        }
        this.heardAt = Date.now();
        this.handle(reply);
      };
    });
  }

  /** Pings the relay, and treats a silent relay as a dropped connection (a dead network can leave the socket open). */
  private startHeartbeat(): void {
    this.heardAt = Date.now();
    this.heartbeat = setInterval(() => {
      if (this.closed) return;
      this.write({ relay: 'ping' });
      const socket = this.socket;
      if (socket && Date.now() - this.heardAt > SILENT_MS) {
        socket.onclose = null;
        socket.close();
        this.dropped(socket);
      }
    }, PING_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private handle(reply: RelayReply): void {
    switch (reply.relay) {
      case 'msg':
        if (reply.seq <= this.lastSeen) return; // a replay we already had
        this.lastSeen = reply.seq;
        if (this.handlers.size === 0) this.unheard.push(reply.data);
        for (const handler of [...this.handlers]) handler(reply.data);
        return;
      case 'rejoined':
        for (const entry of this.sent) if (entry.seq > reply.lastFrom) this.write({ relay: 'msg', ...entry });
        this.synced = true;
        this.status('reconnected');
        return;
      case 'peer-joined':
      case 'peer-left':
      case 'peer-back':
      case 'peer-quit':
        this.status(reply.relay);
        return;
      case 'error':
        // The room is gone (the other player left and the relay closed it): nothing to get back to.
        if (reply.reason === 'no-room' || reply.reason === 'bad-token') this.giveUp();
        return;
      default:
        return;
    }
  }

  /** The connection dropped: rejoin our seat until the window runs out. */
  private dropped(socket: WebSocket): void {
    if (this.closed || socket !== this.socket) return;
    this.socket = null;
    this.synced = false;
    // Clean up a rejoin attempt that hung (the watchdog's case too).
    if (this.retry) clearTimeout(this.retry);
    if (this.lostAt === 0) {
      this.lostAt = Date.now();
      this.status('reconnecting');
    }
    this.scheduleRejoin();
  }

  private scheduleRejoin(): void {
    if (this.closed) return;
    if (Date.now() - this.lostAt > RECONNECT_WINDOW_MS) {
      this.giveUp();
      return;
    }
    this.retry = setTimeout(() => this.rejoin(), RETRY_MS);
  }

  private rejoin(): void {
    this.retry = null;
    if (this.closed) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.address(`code=${this.code}`));
    } catch {
      this.scheduleRejoin();
      return;
    }
    this.socket = socket;
    // A fresh try gets the full silence allowance before the watchdog gives up on it.
    this.heardAt = Date.now();
    socket.onopen = () => {
      socket.send(JSON.stringify({ relay: 'rejoin', code: this.code, token: this.token, lastSeen: this.lastSeen }));
    };
    socket.onmessage = (event) => {
      const reply = JSON.parse(String(event.data)) as RelayReply;
      this.heardAt = Date.now();
      if (reply.relay === 'rejoined') this.lostAt = 0;
      this.handle(reply);
    };
    socket.onclose = () => {
      if (socket !== this.socket || this.closed) return;
      this.socket = null;
      this.scheduleRejoin();
    };
  }

  private giveUp(): void {
    if (this.closed) return;
    this.status('lost');
    this.closed = true;
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
  }

  private write(message: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private status(status: LinkStatus): void {
    for (const handler of [...this.statusHandlers]) handler(status);
  }
}
