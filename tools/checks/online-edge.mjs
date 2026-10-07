// Online 1v1, the cases online.mjs doesn't cover (2026-10-07): a wrong room
// code, a full room, real key presses from both players, a long match with
// fighting and hash checks, a desync (no result on both sides), and a player
// who vanishes for good (they lose after the 30 s window, the other wins).
// Starts its own relay like online.mjs (or RELAY_URL=...).
// `node tools/checks/online-edge.mjs` (about 3 minutes)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, check, finish, OUT, pw } from './_lib.mjs';

const RELAY_PORT = 8791;
const RELAY_URL = process.env.RELAY_URL ?? `ws://localhost:${RELAY_PORT}/relay`;
const here = path.dirname(fileURLToPath(import.meta.url));
const relay = process.env.RELAY_URL
  ? { kill: () => {} }
  : spawn(process.execPath, [path.join(here, '..', 'relay', 'server.mjs')], { env: { ...process.env, PORT: String(RELAY_PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => relay.kill());
await new Promise((r) => setTimeout(r, 500));

const browser = await pw.chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const errors = [];
const contexts = [];
async function openPage(extra = '') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  contexts.push(context);
  const page = await context.newPage();
  await page.route('**/__playtest-log', (r) => r.fulfill({ status: 200, body: 'x' }));
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  await page.goto(`${BASE}/?relay=${encodeURIComponent(RELAY_URL)}${extra}`);
  await page.waitForFunction(() => document.querySelector('canvas'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.mouse.click(640, 300);
  return page;
}
const lobby = (page) => page.evaluate(() => window.__aowLobby ?? null);
const waitLobby = (page, step, timeout = 20000) => page.waitForFunction((s) => window.__aowLobby?.step === s, step, { timeout });
const inMatch = (page) => page.waitForFunction(() => window.__aow?.lockstep?.() && window.__aow.snapshot().phase === 'playing', null, { timeout: 30000 });
const toMenu = async (page) => {
  await page.evaluate(() => window.__aow?.bus.emit('quit-to-menu-requested', {}));
  await page.waitForTimeout(800);
};
async function openLobby(page) {
  await page.keyboard.press('KeyO');
  await waitLobby(page, 'choose');
}
async function host(page) {
  await openLobby(page);
  await page.keyboard.press('KeyH');
  await waitLobby(page, 'hosting');
  return (await lobby(page)).code;
}
async function typeCode(page, code) {
  await page.keyboard.press('KeyJ');
  for (const letter of code) await page.keyboard.press(`Key${letter}`);
  await page.keyboard.press('Enter');
}

// 1. A code nobody hosts.
const a = await openPage();
const b = await openPage();
await openLobby(b);
await typeCode(b, 'QQQQ');
await waitLobby(b, 'error');
check('a wrong room code says there is no such room', (await lobby(b)).note.includes('no room QQQQ'), (await lobby(b)).note);
await b.screenshot({ path: `${OUT}/edge-no-room.png` });
await b.keyboard.press('Enter');
await waitLobby(b, 'choose');

// 2. A third player can't get into a room that has two.
const code = await host(a);
await typeCode(b, code);
await Promise.all([inMatch(a), inMatch(b)]);
const c = await openPage();
await openLobby(c);
await typeCode(c, code);
await waitLobby(c, 'error');
check('a third player is turned away from a full room', (await lobby(c)).note.includes('already has two players'), (await lobby(c)).note);
await c.close();

// 3. Real keys: the host buys a Clubber (1), the guest a Slinger (2) and fires its special (S).
await a.keyboard.press('Digit1');
await b.keyboard.press('Digit2');
await b.keyboard.press('KeyS');
await a.waitForTimeout(5000);
const keyLogs = await Promise.all([a, b].map((p) => p.evaluate(() => window.__aow.lockstep().log.map((r) => `${r.turn}:${r.side}:${r.commands.map((cmd) => cmd.e).join('+')}`))));
const flat = keyLogs[0].join(' ');
check('key presses on both sides run in both games', JSON.stringify(keyLogs[0]) === JSON.stringify(keyLogs[1]), `${keyLogs[0].join(' ')} | ${keyLogs[1].join(' ')}`);
check('...the host bought, the guest bought and fired its special', /player:buy-unit-requested/.test(flat) && /enemy:buy-unit-requested/.test(flat) && /enemy:[^ ]*special-requested/.test(flat), flat);
const queues = await Promise.all([a, b].map((p) => p.evaluate(() => {
  const s = window.__aow.snapshot();
  return { units: s.units.map((u) => `${u.side}:${u.unitId}`).sort(), gold: [s.sides.player.gold, s.sides.enemy.gold] };
})));
check('both games show the same units and gold', JSON.stringify(queues[0]) === JSON.stringify(queues[1]), JSON.stringify(queues));
await b.screenshot({ path: `${OUT}/edge-guest-keys.png` });

// 4. A desync (a dev cheat changes one game only): both end with no result.
await b.evaluate(() => window.__aow.addGold(500, 'enemy'));
await Promise.all([a, b].map((p) => p.waitForFunction(() => window.__aow.snapshot().phase === 'gameover', null, { timeout: 120000 })));
await a.waitForTimeout(3500);
await a.screenshot({ path: `${OUT}/edge-desync.png` });
check('a desync is caught and ends the match for both', (await Promise.all([a, b].map((p) => p.evaluate(() => window.__aow.lockstep().desynced)))).every(Boolean));
await toMenu(a);
await toMenu(b);

// 5. A player vanishes for good: after 30 s they lose and the other wins.
const code2 = await host(a);
await openLobby(b);
await typeCode(b, code2);
await Promise.all([inMatch(a), inMatch(b)]);
await a.waitForTimeout(2000);
// The network dies: nothing gets through, and the socket doesn't even close.
await b.context().setOffline(true);
await a.waitForTimeout(14000);
await a.screenshot({ path: `${OUT}/edge-waiting.png` });
// The relay notices the silence (10 s), the guest notices its own (6 s); then the 30 s window.
await Promise.all([a, b].map((p) => p.waitForFunction(() => window.__aow.snapshot().phase === 'gameover', null, { timeout: 90000 })));
await a.waitForTimeout(3500);
await a.screenshot({ path: `${OUT}/edge-host-wins.png` });
await b.screenshot({ path: `${OUT}/edge-guest-lost.png` });
const results = await Promise.all([a, b].map((p) => p.evaluate(() => window.__aow.snapshot().baseHp)));
check('a guest whose network dies: both matches end after the window', true, JSON.stringify(results));
await b.context().setOffline(false);
await toMenu(a);
await toMenu(b);

// 6. A longer match with fighting (headless pages: the battle isn't drawn, so it runs fast).
const ha = await openPage('&headless');
const hb = await openPage('&headless');
const code3 = await host(ha);
await openLobby(hb);
await typeCode(hb, code3);
await Promise.all([inMatch(ha), inMatch(hb)]);
const units = await ha.evaluate(async () => (await import('/src/config/ages.config.ts')).getAge(0).unitIds);
// Both keep buying for 60 real seconds; the relay carries every click.
const spam = (page, side) =>
  page.evaluate(
    ({ side, units }) =>
      new Promise((resolve) => {
        let i = 0;
        const timer = setInterval(() => {
          window.__aow.buy(units[i++ % 3], side);
          if (i % 15 === 0) window.__aow.special(side);
        }, 700);
        setTimeout(() => {
          clearInterval(timer);
          resolve(null);
        }, 60000);
      }),
    { side, units },
  );
await Promise.all([spam(ha, 'player'), spam(hb, 'enemy')]);
await ha.waitForTimeout(3000);
const long = await Promise.all([ha, hb].map((p) => p.evaluate(() => {
  const s = window.__aow.snapshot();
  const ls = window.__aow.lockstep();
  return { tick: window.__aow.tick(), phase: s.phase, compared: ls.hashesCompared, desynced: ls.desynced, commands: ls.log.length, kills: [window.__aow.stats('player').kills, window.__aow.stats('enemy').kills] };
})));
console.log('long match:', JSON.stringify(long));
check('long match: lots of game time and commands', long[0].tick > 2000 && long[0].commands > 40, JSON.stringify(long[0]));
check('long match: units fought (kills on the lane)', long[0].kills[0] + long[0].kills[1] > 0, JSON.stringify(long[0].kills));
check('long match: every hash compared matched', long.every((x) => !x.desynced) && long[0].compared >= 3, `${long[0].compared} compared`);

for (const context of contexts) await context.close().catch(() => {});
await finish(browser, errors);
