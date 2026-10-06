// The local lockstep relay (Phase 22 step 3). `npm run relay` (port 8787,
// or PORT=...). Both players open the game with `?relay=ws://<this-pc>:8787`
// when they aren't on the same machine (the default is ws://localhost:8787).
import { WebSocketServer } from 'ws';
import { Rooms } from './rooms.mjs';

const port = Number(process.env.PORT ?? 8787);
const rooms = new Rooms({ log: (line) => console.log(new Date().toISOString().slice(11, 19), line) });
const server = new WebSocketServer({ port });

server.on('connection', (socket) => {
  socket.on('message', (data) => rooms.receive(socket, data.toString()));
  socket.on('close', () => rooms.closed(socket));
  socket.on('error', () => rooms.closed(socket));
});
setInterval(() => rooms.sweep(), 5000).unref();
console.log(`Age of War relay on ws://localhost:${port}`);
