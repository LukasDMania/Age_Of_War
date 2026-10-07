// Online 1v1 (Phase 22 step 3): two browsers, the local relay and the lobby.
// Starts its own relay on port 8790, hosts in one page and joins from the
// other, plays a battle (clicks from both sides, a dropped connection that
// comes back, the hash exchange), then a quit (the other side wins), then a
// Mech Arena start. `node tools/checks/online.mjs`
// RELAY_URL=ws://localhost:8788/relay uses a relay that is already running
// instead (the Cloudflare Worker under `npx wrangler dev --port 8788`).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, check, finish, OUT, pw } from './_lib.mjs';

const RELAY_PORT = 8790;
const RELAY_URL = process.env.RELAY_URL ?? `ws://localhost:${RELAY_PORT}/relay`;
const here = path.dirname(fileURLToPath(import.meta.url));
const relayLog = [];
const relay = process.env.RELAY_URL
  ? { kill: () => {} }
  : spawn(process.execPath, [path.join(here, '..', 'relay', 'server.mjs')], { env: { ...process.env, PORT: String(RELAY_PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
relay.stdout?.on('data', (d) => relayLog.push(String(d).trim()));
await new Promise((r) => setTimeout(r, 500));

const browser = await pw.chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  // Two pages play each other: neither may be throttled as a background page.
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
process.on('exit', () => relay.kill());
process.on('uncaughtException', (e) => {
  console.log(relayLog.join('\n'));
  console.error(e);
  relay.kill();
  process.exit(1);
});
const errors = [];
async function openPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.route('**/__playtest-log', (r) => r.fulfill({ status: 200, body: 'x' }));
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  await page.goto(`${BASE}/?relay=${encodeURIComponent(RELAY_URL)}`);
  await page.waitForFunction(() => document.querySelector('canvas'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.mouse.click(640, 300);
  return page;
}
const lobby = (page) => page.evaluate(() => window.__aowLobby ?? null);
const waitLobby = (page, step) => page.waitForFunction((s) => window.__aowLobby?.step === s, step, { timeout: 20000 });
const inMatch = (page) =>
  page.waitForFunction(() => window.__aow?.lockstep?.() && window.__aow.snapshot().phase === 'playing', null, { timeout: 30000 });

/** Host in `a` (optionally switching to the Mech duel first), join from `b`. */
async function pair(a, b, duel = false) {
  await a.keyboard.press('KeyO');
  await b.keyboard.press('KeyO');
  await waitLobby(a, 'choose');
  if (duel) await a.keyboard.press('KeyM');
  await a.keyboard.press('KeyH');
  await waitLobby(a, 'hosting');
  const { code } = await lobby(a);
  await a.screenshot({ path: `${OUT}/online-lobby-host.png` });
  await waitLobby(b, 'choose');
  await b.keyboard.press('KeyJ');
  for (const letter of code) await b.keyboard.press(`Key${letter}`);
  await b.screenshot({ path: `${OUT}/online-lobby-join.png` });
  await b.keyboard.press('Enter');
  return code;
}

const a = await openPage();
const b = await openPage();

// 1. A battle: host left, guest right.
const code = await pair(a, b);
check('the host got a 4-letter room code', /^[A-Z]{4}$/.test(code), code);
await Promise.all([inMatch(a), inMatch(b)]);
const sides = await Promise.all([a, b].map((p) => p.evaluate(() => window.__aowNet.side)));
check('host plays the left side, guest the right', sides[0] === 'player' && sides[1] === 'enemy', sides.join(','));
const unitIds = await a.evaluate(async () => (await import('/src/config/ages.config.ts')).getAge(0).unitIds);
// Clicks from both sides, as each HUD would send them.
await a.evaluate((u) => window.__aow.buy(u[0], 'player'), unitIds);
await b.evaluate((u) => window.__aow.buy(u[1], 'enemy'), unitIds);
// The guest's request for the host's side is refused.
await b.evaluate((u) => window.__aow.buy(u[0], 'player'), unitIds);
// Wait on game progress, not wall time: headless pages here can draw only a few frames a second.
await Promise.all([a, b].map((p) => p.waitForFunction(() => window.__aow.tick() > 150, null, { timeout: 180000, polling: 500 })));
const after = await Promise.all([a, b].map((p) => p.evaluate(() => ({ tick: window.__aow.tick(), log: window.__aow.lockstep().log }))));
const logOf = (x) => JSON.stringify(x.log.map((r) => [r.turn, r.side, r.commands.map((c) => c.p.unitId)]));
check('both browsers ran the same commands', logOf(after[0]) === logOf(after[1]), `${logOf(after[0])} | ${logOf(after[1])}`);
check('one command per side; the guest could not command the host side', after[0].log.length === 2 && after[0].log.some((r) => r.side === 'enemy'), logOf(after[0]));
// Headless pages here draw ~6 frames a second, so the battle is slow; it only has to move.
check('the battle runs', after[0].tick > 40, `${after[0].tick} ticks`);
await b.screenshot({ path: `${OUT}/online-guest.png` });

// 2. The guest's connection drops and comes back.
await b.evaluate(() => window.__aowNet.dropForTest());
await a.waitForFunction(() => window.__aow.lockstep().ready === false, null, { timeout: 5000 }).catch(() => null);
await a.waitForTimeout(800);
await a.screenshot({ path: `${OUT}/online-opponent-left.png` });
await b.waitForTimeout(4000);
const resumed = await Promise.all([a, b].map((p) => p.evaluate(() => ({ tick: window.__aow.tick(), phase: window.__aow.snapshot().phase }))));
// Run until a second hash pair is compared (every 150 turns), or 90 s.
await a.waitForFunction(() => window.__aow.lockstep().hashesCompared >= 2, null, { timeout: 300000, polling: 1000 }).catch(() => null);
const later = await Promise.all([a, b].map((p) => p.evaluate(() => ({ tick: window.__aow.tick(), ls: window.__aow.lockstep() }))));
check('after the drop both games run on', later[0].tick > resumed[0].tick + 100 && later[1].tick > resumed[1].tick + 100, JSON.stringify({ resumed, later: later.map((x) => x.tick) }));
check('hashes were exchanged and match', later[0].ls.hashesCompared >= 2 && !later[0].ls.desynced && !later[1].ls.desynced, `${later[0].ls.hashesCompared} compared`);

// 3. The guest quits: the host wins.
await b.evaluate(() => window.__aow.bus.emit('quit-to-menu-requested', {}));
await a.waitForFunction(() => window.__aow.snapshot().phase === 'gameover', null, { timeout: 10000 });
await a.waitForTimeout(3500);
await a.screenshot({ path: `${OUT}/online-forfeit.png` });
check('a quit ends the match for the other player', (await a.evaluate(() => window.__aow.snapshot().phase)) === 'gameover');

// 4. The Mech Arena (lobby M): both farm the same raiders.
await a.evaluate(() => window.__aow.bus.emit('quit-to-menu-requested', {}));
await a.waitForTimeout(1500);
await b.waitForTimeout(500);
await pair(a, b, true);
await Promise.all([inMatch(a), inMatch(b)]);
await Promise.all([a, b].map((p) => p.waitForFunction(() => window.__aow.snapshot().units.some((u) => u.raider), null, { timeout: 180000, polling: 500 })));
const arena = await Promise.all([a, b].map((p) => p.evaluate(() => {
  const s = window.__aow.snapshot();
  const ls = window.__aow.lockstep();
  return { phase: window.__aow.state.arena?.phase, raiders: s.units.filter((u) => u.raider).length, desynced: ls.desynced, tick: window.__aow.tick() };
})));
check('the online Mech Arena starts in the farm on both sides, raiders coming', arena.every((x) => x.phase === 'farm' && x.raiders > 0 && !x.desynced), JSON.stringify(arena));
await b.screenshot({ path: `${OUT}/online-arena-guest.png` });

relay.kill();
console.log(relayLog.join('\n'));
await finish(browser, errors);
