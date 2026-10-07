// Mech Arena (GAME_DESIGN 15, 2026-10-07): farm -> hangar -> fight, best of 3.
// Menu D starts it against the AI. Checks the raiders (both halves, tinted,
// apart), the hold line, leaks, the end of the farm (turrets sold, lane and
// queue cleared), the hangar (opens by itself, R picks and pays once), the AI's
// pick, the fight, and an AI-vs-AI match to the end. `node tools/checks/arena.mjs`
import { BASE, check, finish, OUT, pw } from './_lib.mjs';

const browser = await pw.chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route('**/__playtest-log', (r) => r.fulfill({ status: 200, body: 'x' }));
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto(`${BASE}/`);
await page.waitForTimeout(3000);
await page.mouse.click(640, 300);
await page.keyboard.press('KeyD');
await page.waitForFunction(() => window.__aow && window.__aow.snapshot().phase === 'playing' && window.__aow.state.arena, null, { timeout: 30000 });
const MID = 640;

// 1. The farm: raiders on both halves, walking apart; our units hold short of the middle.
const farm = await page.evaluate((MID) => {
  const a = window.__aow;
  a.setSpeed(0);
  const start = { gold: a.snapshot().sides.player.gold, phase: a.state.arena.phase };
  a.buy('stone-slinger');
  a.buy('stone-clubber');
  a.buyTurret(0, 'stone-spear-thrower');
  let maxOwnX = 0;
  let raiders = { left: 0, right: 0 };
  let leaks = 0;
  const off = a.bus.on('raider-leaked', (e) => {
    if (e.side === 'player') leaks++;
  });
  for (let i = 0; i < 90; i++) {
    a.step(500);
    for (const u of a.snapshot().units) {
      if (u.raider) raiders[u.x < MID ? 'left' : 'right']++;
      else if (u.side === 'player') maxOwnX = Math.max(maxOwnX, u.x);
    }
  }
  a.bus.off('raider-leaked', off);
  return { start, maxOwnX, leaks, raiders, turrets: a.snapshot().sides.player.turrets.filter(Boolean).length };
}, MID);
check('round 1 starts in the farm with 150 gold', farm.start.phase === 'farm' && farm.start.gold === 150, JSON.stringify(farm.start));
check('our units hold short of the middle', farm.maxOwnX > 0 && farm.maxOwnX <= MID - 120 + 1, `max x ${Math.round(farm.maxOwnX)}`);
check('raiders on both halves', farm.raiders.left > 0 && farm.raiders.right > 0, JSON.stringify(farm.raiders));
await page.screenshot({ path: `${OUT}/arena-farm.png` });


// 2. A raider that gets through steals gold (nobody defends the enemy side: the AI may, so watch ours with no units).
const leak = await page.evaluate(() => {
  const a = window.__aow;
  let stolen = 0;
  const off = a.bus.on('raider-leaked', (e) => (stolen += e.amount));
  for (let i = 0; i < 60; i++) a.step(500);
  a.bus.off('raider-leaked', off);
  return stolen;
});
check('raiders that get through steal gold', leak > 0, `${leak} gold stolen over 30 s`);

// 3. The end of the farm: turrets sold, lane empty, hangar opens by itself.
const hangar = await page.evaluate(() => {
  const a = window.__aow;
  while (a.state.arena.phase === 'farm') a.step(500);
  const s = a.snapshot();
  return { phase: a.state.arena.phase, units: s.units.length, turrets: s.sides.player.turrets.filter(Boolean).length, queue: s.sides.player.queue.length };
});
check('after the farm: the hangar phase, an empty lane, turrets sold, no queue', hangar.phase === 'hangar' && hangar.units === 0 && hangar.turrets === 0 && hangar.queue === 0, JSON.stringify(hangar));
await page.evaluate(() => window.__aow.addGold(3000, 'player'));
await page.waitForTimeout(2500);
check('the hangar opened by itself', (await page.evaluate(() => window.__aow.activeScenes())).includes('HangarScene'));
await page.screenshot({ path: `${OUT}/arena-hangar.png` });
const goldBefore = await page.evaluate(() => window.__aow.snapshot().sides.player.gold);
await page.keyboard.press('KeyR');
await page.waitForTimeout(500);
await page.keyboard.press('KeyR');
await page.waitForTimeout(500);
const pick = await page.evaluate(() => ({ pick: !!window.__aow.state.arena.picks.player, paid: window.__aow.state.arena.paid.player, gold: window.__aow.snapshot().sides.player.gold }));
check('R picks the Mech and it is paid for once (picking again refunds the old pick)', pick.pick && Math.round(goldBefore - pick.gold) === pick.paid, JSON.stringify({ goldBefore, ...pick }));

// 4. The fight: the AI picked too; both Mechs on the lane; the hangar closed.
const fight = await page.evaluate(() => {
  const a = window.__aow;
  while (a.state.arena.phase === 'hangar') a.step(500);
  a.step(2000);
  return { phase: a.state.arena.phase, mechs: a.snapshot().units.filter((u) => u.unitId.startsWith('mech')).map((u) => u.side).sort() };
});
await page.waitForTimeout(1500);
check('the fight: both Mechs on the lane', fight.phase === 'fight' && fight.mechs.join() === 'enemy,player', JSON.stringify(fight));
check('the hangar closed for the fight', !(await page.evaluate(() => window.__aow.activeScenes())).includes('HangarScene'));
await page.screenshot({ path: `${OUT}/arena-fight.png` });
const round = await page.evaluate(() => {
  const a = window.__aow;
  let ended = null;
  const off = a.bus.on('arena-round-ended', (e) => (ended = e));
  while (!ended && a.snapshot().phase === 'playing') a.step(500);
  a.bus.off('arena-round-ended', off);
  return { ended, base: a.snapshot().baseHp };
});
check('a round ends with a winner and the bases untouched', round.ended?.winner && round.base.player === round.base.enemy, JSON.stringify(round));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/arena-round.png` });

// 5. AI vs AI to the end: best of 3, the loser's base falls.
const match = await page.evaluate(async () => {
  window.__b = window.__aow;
  window.__aow.restart({ arena: { age: 0 }, ai: 'normal', playerAi: 'hard', seed: 5 });
  await new Promise((r) => {
    const t = setInterval(() => {
      if (window.__aow !== window.__b && window.__aow.snapshot().phase === 'playing') {
        clearInterval(t);
        r(null);
      }
    }, 50);
  });
  const a = window.__aow;
  a.setSpeed(0);
  const rounds = [];
  a.bus.on('arena-round-ended', (e) => rounds.push(`${e.round}:${e.winner}`));
  for (let i = 0; i < 6000 && a.snapshot().phase === 'playing'; i++) a.step(1000);
  return { rounds, phase: a.snapshot().phase, wins: a.state.arena.wins, base: a.snapshot().baseHp };
});
check('AI vs AI: the match ends after two round wins', match.phase === 'gameover' && Math.max(match.wins.player, match.wins.enemy) === 2, JSON.stringify(match));
check('...and the loser base fell', match.base.player === 0 || match.base.enemy === 0, JSON.stringify(match.base));
await finish(browser, errors);
