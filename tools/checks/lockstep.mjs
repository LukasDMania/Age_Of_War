// Lockstep multiplayer, step 2 (2026-10-05): the command queue against a
// pretend opponent in the same page (LoopbackTransport). Commands run a set
// number of turns later; the other side's commands only command its side;
// pause is refused; a match replays from its command log to the same state
// hashes; a wrong hash is reported as a desync; with real network delay the
// match still runs. `node tools/checks/lockstep.mjs`
import { check, finish, openGame } from './_lib.mjs';

const SEED = 4242;
const { browser, page, errors } = await openGame('?ai=off');

/** Restarts into a lockstep match built in the page by `make` (gets the dev modules), and freezes real-time stepping unless `live`. */
async function start(make, arg, live = false) {
  await page.evaluate(
    async ({ make, arg }) => {
      const loopback = await import('/src/dev/loopback.ts');
      const transport = await import('/src/net/transport.ts');
      const features = await import('/src/config/features.config.ts');
      // eslint-disable-next-line no-new-func
      const data = new Function('m', 'arg', `return (${make})(m, arg)`)({ ...loopback, ...transport, ...features }, arg);
      window.__aowBefore = window.__aow;
      window.__aow.restart(data);
    },
    { make: make.toString(), arg },
  );
  await page.waitForFunction(
    (live) => {
      const a = window.__aow;
      if (!a || a === window.__aowBefore || a.snapshot().phase !== 'playing') return false;
      if (!live) a.setSpeed(0);
      return true;
    },
    live,
    { timeout: 30000, polling: 'raf' },
  );
}

const unitIds = await page.evaluate(async () => (await import('/src/config/ages.config.ts')).getAge(0).unitIds);
const { TURN_TICKS, DELAY } = await page.evaluate(async () => {
  const c = await import('/src/config/multiplayer.config.ts');
  return { TURN_TICKS: c.TURN_TICKS, DELAY: c.INPUT_DELAY.default };
});

// 1. A command waits for its turn: it goes out at the next turn start (turn n), for turn n + delay.
await start((m, seed) => m.loopbackMatch({ ai: 'off', seed }), SEED);
const delay = await page.evaluate((unit) => {
  const a = window.__aow;
  const tickMs = 1000 / 60;
  while (a.tick() < 100) a.step(tickMs);
  const given = a.tick();
  a.buy(unit);
  const held = a.snapshot().sides.player.queue.length;
  while (a.snapshot().sides.player.queue.length === 0 && a.tick() < 200) a.step(tickMs);
  return { given, held, ranAfter: a.tick() };
}, unitIds[0]);
// `given` ticks have run, so the next turn to start is ceil(given / TURN_TICKS).
const expectedRun = (Math.ceil(delay.given / TURN_TICKS) + DELAY) * TURN_TICKS;
check('a click is held back, not acted on at once', delay.held === 0);
check('it runs at the start of the next turn + delay (tick-exact)', delay.ranAfter === expectedRun + 1, JSON.stringify({ ...delay, expectedRun }));

// 2. An army hotkey is one command and still queues several units.
// Through the typed emit, as the HUD does (the raw `__aow.bus.emit` skips the gate).
// (`__aow.request` is the game's own emit; importing EventBus.ts could load a second copy after a hot reload.)
const armyGated = await page.evaluate(() => {
  const a = window.__aow;
  let result = null;
  const listener = (e) => (result = e);
  a.bus.on('army-queued', listener);
  const before = a.snapshot().sides.player.queue.length;
  a.request('queue-army-requested', { side: 'player', army: [{ slot: 1, count: 2 }] });
  const held = a.snapshot().sides.player.queue.length === before && result === null;
  for (let i = 0; i < 12; i++) a.step(1000 / 60);
  a.bus.off('army-queued', listener);
  return { held, result };
});
check('army hotkey: held back, then one command queues several units', armyGated.held && armyGated.result?.queued === 2, JSON.stringify(armyGated));

// 3. Pause is refused in a lockstep match.
const paused = await page.evaluate(() => {
  window.__aow.request('pause-requested', {});
  return window.__aow.snapshot().phase;
});
check('pause is refused (both share one battle)', paused === 'playing', paused);

// 4. The opponent's commands only ever command its own side.
await start(
  (m, { seed, unit }) => m.loopbackMatch({ ai: 'off', seed, commandsFor: (turn) => (turn === 50 ? [{ e: 'buy-unit-requested', p: { side: 'player', unitId: unit } }] : []) }),
  { seed: SEED, unit: unitIds[0] },
);
const remote = await page.evaluate((turnTicks) => {
  const a = window.__aow;
  while (a.tick() < 50 * turnTicks + 2) a.step(1000 / 60);
  const s = a.snapshot().sides;
  return { player: s.player.queue.length, enemy: s.enemy.queue.length, log: a.lockstep().log };
}, TURN_TICKS);
check('a remote command claiming our side runs for the other side', remote.player === 0 && remote.enemy === 1, JSON.stringify(remote));
check('...on its turn (50)', remote.log.length === 1 && remote.log[0].turn === 50 && remote.log[0].side === 'enemy');

// 5. A whole match replays from its command log to the same hashes.
const MILESTONES = 30;
const played = await (async () => {
  await start((m, seed) => m.loopbackMatch({ ai: 'normal', seed }), SEED);
  return page.evaluate(
    ({ units, milestones }) => {
      const a = window.__aow;
      const hashes = [];
      for (let m = 1; m <= milestones && a.snapshot().phase === 'playing'; m++) {
        while (a.tick() < m * 600 && a.snapshot().phase === 'playing') {
          // The player clicks now and then: units, a turret, an army.
          if (a.tick() % 173 === 0) a.buy(units[(a.tick() / 173) % 3]);
          if (a.tick() === 1500) a.buyTurret(0, 'stone-spear-thrower');
          if (a.tick() % 997 === 0) a.special();
          a.step(1000 / 60);
        }
        hashes.push(`${a.tick()}:${a.hash()}`);
      }
      const s = a.snapshot();
      return { hashes, log: a.lockstep().log, desynced: a.lockstep().desynced, phase: s.phase, ages: [s.sides.player.age, s.sides.enemy.age] };
    },
    { units: unitIds, milestones: MILESTONES },
  );
})();
console.log(`played: ${played.hashes.length} milestones, ${played.phase}, ${played.log.length} command turns, ages ${played.ages}`);
check('the played match had player commands', played.log.filter((r) => r.side === 'player').length >= 5, `${played.log.length}`);
check('no desync with an honest opponent', !played.desynced);
const setupSeed = SEED;
await start((m, { seed, log }) => {
  const data = m.loopbackMatch({ ai: 'normal', seed });
  data.lockstep.transport.close();
  return { ...data, lockstep: { ...data.lockstep, localSide: null, transport: null, replay: log } };
}, { seed: setupSeed, log: played.log });
const replayed = await page.evaluate((count) => {
  const a = window.__aow;
  const hashes = [];
  for (let m = 1; m <= count && a.snapshot().phase === 'playing'; m++) {
    while (a.tick() < m * 600 && a.snapshot().phase === 'playing') a.step(1000 / 60);
    hashes.push(`${a.tick()}:${a.hash()}`);
  }
  return hashes;
}, played.hashes.length);
const firstDiff = played.hashes.findIndex((h, i) => h !== replayed[i]);
check('the command log replays to identical hashes', firstDiff === -1, firstDiff === -1 ? '' : `milestone ${firstDiff + 1}: ${played.hashes[firstDiff]} vs ${replayed[firstDiff]}`);

// 6. A wrong hash from the other side is a desync.
// Listen before the match starts: the first hash goes out on its first tick.
await page.evaluate(() => {
  window.__desyncSeen = null;
  const listener = (e) => (window.__desyncSeen = e);
  window.__aow.bus.on('desync-detected', listener);
  window.__desyncOff = () => window.__aow.bus.off('desync-detected', listener);
});
await start((m, seed) => m.loopbackMatch({ ai: 'off', seed, corruptHash: true }), SEED);
const desync = await page.evaluate(() => {
  const a = window.__aow;
  while (a.tick() < 100) a.step(1000 / 60);
  window.__desyncOff();
  return { seen: window.__desyncSeen, flag: a.lockstep().desynced };
});
check('a wrong hash is reported as a desync (desync-detected)', desync.flag && desync.seen?.turn === 0, JSON.stringify(desync));

// 7. Real delay (80 ms one-way): the match runs in real time and commands land.
await start((m, seed) => m.loopbackMatch({ ai: 'normal', seed, latencyMs: 80 }), SEED, true);
const t0 = await page.evaluate(() => window.__aow.tick());
await page.evaluate((unit) => window.__aow.buy(unit), unitIds[0]);
// On game progress, not wall time: headless pages here can draw only a few frames a second.
await page.waitForFunction((t0) => window.__aow.tick() - t0 >= 30, t0, { timeout: 60000, polling: 200 }).catch(() => null);
const live = await page.evaluate(() => ({ tick: window.__aow.tick(), log: window.__aow.lockstep().log.length, queue: window.__aow.snapshot().sides.player.queue.length }));
check('with 80 ms delay the match keeps running', live.tick - t0 >= 30, `${live.tick - t0} ticks`);
check('...and the click ran', live.log >= 1, JSON.stringify(live));

await finish(browser, errors);
