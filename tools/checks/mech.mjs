// The Mech workshop in a match: Workshop tab by keys, parts, build, spawn, fall. `node tools/checks/mech.mjs`
import { check, finish, openGame, OUT } from './_lib.mjs';

const { browser, page, errors } = await openGame();
await page.evaluate(() => localStorage.removeItem('aow-mech-design'));
await page.mouse.click(640, 300);
const press = async (key, wait = 150) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(wait);
};
const mech = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__aow.state.player.mech)));
await press('KeyB', 400);
await page.screenshot({ path: `${OUT}/mech-tab.png` });
await press('Digit5');
await press('KeyE');
const stored = await page.evaluate(() => localStorage.getItem('aow-mech-design'));
check('5, E switches the right arm and keeps the design', stored?.includes('"right":"shield"') ?? false, stored ?? 'none');
await press('KeyQ');
await page.evaluate(() => {
  window.__aow.state.player.gold = 0;
});
await press('KeyR');
check('R with no gold does nothing', (await mech()).build === null);
await page.evaluate(() => window.__aow.addGold(5000));
await press('KeyR', 300);
let m = await mech();
check('R builds the Mech', m.build !== null, m.build?.unitId ?? 'none');
await page.evaluate(() => window.__aow.step(60000));
m = await mech();
check('the Mech walks out when built', m.alive && m.build === null);
await page.evaluate(() => {
  const u = window.__aow.snapshot().units.find((x) => x.unitId.startsWith('mech:'));
  if (u) window.__aow.kill(u.id);
  window.__aow.step(100);
});
m = await mech();
check('the Mech falls and the Workshop frees up', !m.alive && m.build === null);
await finish(browser, errors);
