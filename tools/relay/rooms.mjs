/**
 * Lockstep relay rooms (Phase 22 step 3, 2026-10-06). Pairs two players by
 * a 4-letter room code and forwards their messages; it never looks inside
 * them. Plain JS with no server library, so the Node relay (server.mjs) and
 * the Cloudflare Worker (step 4) can share it.
 *
 * A socket here is anything with `send(text)` and `close()`. The Node relay
 * keeps every room in one `Rooms`; the Worker has one Durable Object per
 * room code, each with its own `Rooms` that only ever holds that code
 * (`newCode`).
 *
 * Client -> relay (JSON):
 *   { relay: 'host' }                          open a room, play the left side
 *   { relay: 'join', code }                    join a room, play the right side
 *   { relay: 'rejoin', code, token, lastSeen } back after a dropped connection
 *   { relay: 'msg', seq, data }                forward `data` to the other player
 *   { relay: 'leave' }                         quit (the other player is told)
 *   { relay: 'ping' }                          heartbeat (every 2 s); answered with { relay: 'pong' }
 * Relay -> client:
 *   { relay: 'room', code, side, token }       hosted
 *   { relay: 'joined', code, side, token }     joined
 *   { relay: 'rejoined', side, lastFrom }      back; resend what came after `lastFrom`
 *   { relay: 'peer-joined' | 'peer-left' | 'peer-back' | 'peer-quit' }
 *   { relay: 'msg', seq, data }                from the other player
 *   { relay: 'error', reason }                 'no-room' | 'full' | 'taken' | 'bad-token' | 'bad-message'
 *
 * A player the relay hasn't heard from for `SILENT_MS` counts as dropped,
 * even if the socket still looks open: a dead network can leave it half
 * open for minutes. (Checked whenever anyone in the room speaks, and in
 * `sweep`.)
 *
 * No message is lost to a dropped connection: each direction is numbered,
 * the relay keeps the recent ones, and a rejoin replays what the player
 * missed (`lastSeen`) and asks for what the relay missed (`lastFrom`).
 */

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Messages kept per direction for replays after a reconnect (30 a second: about 2 minutes). */
const KEEP_MESSAGES = 4000;
/** A seated player silent this long (no turn, no heartbeat) is dropped (ms). */
export const SILENT_MS = 10_000;
/** A room with nobody connected is dropped after this long (ms). */
export const ROOM_HOLD_MS = 60_000;

const SIDES = ['player', 'enemy'];
const other = (side) => (side === 'player' ? 'enemy' : 'player');

export function randomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return code;
}

function randomToken() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 2 ** 32).toString(16).padStart(8, '0')).join('');
}

function newSlot() {
  return { socket: null, token: randomToken(), inbox: [], nextSeq: 0, lastFrom: 0, used: false };
}

export class Rooms {
  /** `newCode`: the code for the next hosted room (default random, unused). */
  constructor({ now = () => Date.now(), log = () => {}, newCode = null } = {}) {
    this.newCode = newCode;
    this.rooms = new Map();
    /** socket -> { code, side } */
    this.seats = new Map();
    /** socket -> when the relay last heard from it (ms) */
    this.heard = new Map();
    this.now = now;
    this.log = log;
  }

  /** A text frame from `socket`. */
  receive(socket, text) {
    this.heard.set(socket, this.now());
    this.dropSilent(this.seats.get(socket)?.code);
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return this.send(socket, { relay: 'error', reason: 'bad-message' });
    }
    switch (message?.relay) {
      case 'host':
        return this.host(socket);
      case 'join':
        return this.join(socket, String(message.code ?? '').toUpperCase());
      case 'rejoin':
        return this.rejoin(socket, String(message.code ?? '').toUpperCase(), message.token, Number(message.lastSeen) || 0);
      case 'msg':
        return this.forward(socket, Number(message.seq) || 0, message.data);
      case 'leave':
        return this.leave(socket);
      case 'ping':
        return this.send(socket, { relay: 'pong' });
      default:
        return this.send(socket, { relay: 'error', reason: 'bad-message' });
    }
  }

  /** `socket` closed (or errored). */
  closed(socket) {
    const seat = this.seats.get(socket);
    this.seats.delete(socket);
    this.heard.delete(socket);
    if (!seat) return;
    const room = this.rooms.get(seat.code);
    const slot = room?.slots[seat.side];
    if (!room || !slot || slot.socket !== socket) return;
    slot.socket = null;
    this.tell(room, other(seat.side), { relay: 'peer-left' });
    this.log(`room ${seat.code}: ${seat.side} dropped`);
  }

  /** Drops rooms nobody has been connected to for `ROOM_HOLD_MS`. Call now and then. */
  sweep() {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      this.dropSilent(code);
      const connected = SIDES.some((side) => room.slots[side].socket);
      if (connected) room.emptySince = null;
      else if (room.emptySince === null) room.emptySince = now;
      else if (now - room.emptySince > ROOM_HOLD_MS) {
        this.rooms.delete(code);
        this.log(`room ${code}: closed`);
      }
    }
  }

  host(socket) {
    let code;
    if (this.newCode) {
      code = this.newCode();
      // The Worker picked a code that is already a room: the client tries another.
      if (this.rooms.has(code)) return this.send(socket, { relay: 'error', reason: 'taken' });
    } else {
      code = randomCode();
      while (this.rooms.has(code)) code = randomCode();
    }
    const room = { code, slots: { player: newSlot(), enemy: newSlot() }, emptySince: null };
    this.rooms.set(code, room);
    this.seat(socket, room, 'player');
    this.send(socket, { relay: 'room', code, side: 'player', token: room.slots.player.token });
    this.log(`room ${code}: hosted`);
  }

  join(socket, code) {
    const room = this.rooms.get(code);
    if (!room) return this.send(socket, { relay: 'error', reason: 'no-room' });
    if (room.slots.enemy.used) return this.send(socket, { relay: 'error', reason: 'full' });
    this.seat(socket, room, 'enemy');
    this.send(socket, { relay: 'joined', code, side: 'enemy', token: room.slots.enemy.token });
    this.tell(room, 'player', { relay: 'peer-joined' });
    this.log(`room ${code}: joined`);
  }

  rejoin(socket, code, token, lastSeen) {
    const room = this.rooms.get(code);
    const side = room && SIDES.find((s) => room.slots[s].token === token);
    if (!room || !side) return this.send(socket, { relay: 'error', reason: room ? 'bad-token' : 'no-room' });
    const slot = room.slots[side];
    if (slot.socket && slot.socket !== socket) {
      this.seats.delete(slot.socket);
      try {
        slot.socket.close();
      } catch {
        // already gone
      }
    }
    this.seat(socket, room, side);
    this.send(socket, { relay: 'rejoined', side, lastFrom: slot.lastFrom });
    for (const entry of slot.inbox) if (entry.seq > lastSeen) this.send(socket, { relay: 'msg', seq: entry.seq, data: entry.data });
    this.tell(room, other(side), { relay: 'peer-back' });
    this.log(`room ${code}: ${side} back`);
  }

  forward(socket, seq, data) {
    const seat = this.seats.get(socket);
    const room = seat && this.rooms.get(seat.code);
    if (!room) return this.send(socket, { relay: 'error', reason: 'no-room' });
    const from = room.slots[seat.side];
    // Only the next message in order. A resend it already has is skipped; one
    // that jumps ahead (sent after a rejoin, before `rejoined` came back) is
    // dropped too: the client resends everything after `lastFrom`, in order,
    // when `rejoined` arrives. Taking it would make those earlier ones look
    // like resends and lose them (found 2026-10-07).
    if (seq !== from.lastFrom + 1) return;
    from.lastFrom = seq;
    const to = room.slots[other(seat.side)];
    const entry = { seq: ++to.nextSeq, data };
    to.inbox.push(entry);
    if (to.inbox.length > KEEP_MESSAGES) to.inbox.splice(0, to.inbox.length - KEEP_MESSAGES);
    if (to.socket) this.send(to.socket, { relay: 'msg', seq: entry.seq, data });
  }

  leave(socket) {
    const seat = this.seats.get(socket);
    this.seats.delete(socket);
    const room = seat && this.rooms.get(seat.code);
    if (!room) return;
    this.tell(room, other(seat.side), { relay: 'peer-quit' });
    this.rooms.delete(seat.code);
    for (const side of SIDES) {
      const s = room.slots[side].socket;
      if (s) {
        this.seats.delete(s);
        this.heard.delete(s);
      }
    }
    this.heard.delete(socket);
    this.log(`room ${seat.code}: ${seat.side} left, closed`);
  }

  /** Drops the players of room `code` who have gone silent (their network died). */
  dropSilent(code) {
    const room = code && this.rooms.get(code);
    if (!room) return;
    const now = this.now();
    for (const side of SIDES) {
      const socket = room.slots[side].socket;
      if (!socket || now - (this.heard.get(socket) ?? now) <= SILENT_MS) continue;
      this.log(`room ${code}: ${side} silent`);
      try {
        socket.close();
      } catch {
        // already gone
      }
      this.closed(socket);
    }
  }

  seat(socket, room, side) {
    const slot = room.slots[side];
    slot.socket = socket;
    slot.used = true;
    this.heard.set(socket, this.now());
    this.seats.set(socket, { code: room.code, side });
  }

  tell(room, side, message) {
    const socket = room.slots[side].socket;
    if (socket) this.send(socket, message);
  }

  send(socket, message) {
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      // Closed under us: the close handler cleans up.
      this.log(`send failed: ${error}`);
    }
  }
}
