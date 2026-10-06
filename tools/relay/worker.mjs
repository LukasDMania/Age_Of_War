// The hosted relay and the game (Phase 22 step 4): one Cloudflare Worker.
// Files from `dist/` (the built game) are served as static assets; a
// WebSocket to /relay goes to a Durable Object per room code, which runs the
// same room logic as the local relay (rooms.mjs). Deploy with `npm run
// deploy` (wrangler.toml); try locally with `npx wrangler dev`.
//
// /relay?host=1        open a room: the Worker picks a code
// /relay?code=ABCD     join or rejoin room ABCD
import { randomCode, Rooms } from './rooms.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/relay') return env.ASSETS.fetch(request);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const code = url.searchParams.has('host') ? randomCode() : (url.searchParams.get('code') ?? '').toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) return new Response('Bad room code', { status: 400 });
    const room = env.RELAY.get(env.RELAY.idFromName(code));
    const inner = new URL(request.url);
    inner.searchParams.set('code', code);
    return room.fetch(new Request(inner, request));
  },
};

/** One room: its two players' sockets and the messages kept for reconnects (in memory). */
export class RelayRoom {
  constructor() {
    this.code = '';
    // Room events go to the Worker's log (`npx wrangler tail`).
    this.rooms = new Rooms({ newCode: () => this.code, log: (line) => console.log(line) });
  }

  async fetch(request) {
    this.code = new URL(request.url).searchParams.get('code') ?? '';
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const socket = { send: (text) => server.send(text), close: () => server.close() };
    server.addEventListener('message', (event) => {
      if (typeof event.data === 'string') this.rooms.receive(socket, event.data);
    });
    server.addEventListener('close', () => {
      this.rooms.closed(socket);
      // Finish the closing handshake: without it the runtime stalled this
      // room's other socket after a player dropped (found with wrangler dev).
      try {
        server.close(1000, 'bye');
      } catch {
        // already closed
      }
    });
    server.addEventListener('error', () => this.rooms.closed(socket));
    return new Response(null, { status: 101, webSocket: client });
  }
}
