// Account level and Mech part unlocks (Mech expansion step 4). `node tools/checks/account.mjs`
import { check, finish, openGame, OUT } from './_lib.mjs';

const { browser, page, errors } = await openGame();
const restart = () =>
  page.evaluate(async () => {
    window.__aow.restart({ ai: 'off' });
    await new Promise((r) => setTimeout(r, 400));
  });
await page.evaluate(() => localStorage.removeItem('aow-account'));
await restart();
const locked = () => page.evaluate(() => window.__aow.state.player.mechLocked);
let l = await locked();
check('a fresh account has the wild parts locked', l.includes('legs:hover') && l.includes('arm:tesla') && !l.includes('legs:walker'), `${l.length} locked`);
const tryBuild = (design) =>
  page.evaluate((design) => {
    const a = window.__aow;
    a.addGold(99999);
    a.bus.emit('build-mech-requested', { side: 'player', design });
    const built = a.state.player.mech.build !== null;
    a.state.player.mech.build = null;
    return built;
  }, design);
const hover = { legs: 'hover', torso: 'frame', head: 'visor', left: 'fist', right: 'launcher', module: 'none' };
check('a locked part cannot be built', !(await tryBuild(hover)));
await page.evaluate(() => window.__aow.unlockAll());
check('unlockAll opens it', await tryBuild(hover));
await page.evaluate(() => window.__aow.unlockAll(false));

// A won match with 20 units alive at once: XP, level 2, Big army opens the Troop carrier.
await restart();
await page.evaluate(() => {
  const a = window.__aow;
  for (let i = 0; i < 20; i++) {
    a.spawn('stone-clubber', 'player');
    const u = a.snapshot().units.at(-1);
    a.place(u.id, 260 + i * 24);
  }
  a.damageBase('enemy', 999999);
});
await page.waitForTimeout(3500);
const account = await page.evaluate(() => JSON.parse(localStorage.getItem('aow-account')));
check('a win pays account XP', account?.xp >= 100, JSON.stringify(account));
check('Big army counted', account?.counters?.['big-army'] >= 20);
await page.screenshot({ path: `${OUT}/account-gameover.png` });
await restart();
l = await locked();
check('Big army opened the Troop carrier', !l.includes('torso:carrier') && l.includes('head:scope'), `${l.length} locked`);
await page.evaluate(() => window.__aow.accountXp(150));
l = await locked();
check('account level 2 opens the Sniper scope and Flamethrower', !l.includes('head:scope') && !l.includes('arm:flamer') && l.includes('legs:hover'), `${l.length} locked`);
await page.keyboard.press('KeyB');
await page.waitForTimeout(500);
await page.keyboard.press('Digit1');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/account-hangar.png` });
await page.evaluate(() => localStorage.removeItem('aow-account'));
await finish(browser, errors);
