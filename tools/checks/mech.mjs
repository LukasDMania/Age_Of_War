// The Mech hangar in a match: open by key, parts, hover preview, blueprints, build, spawn, fall. `node tools/checks/mech.mjs`
import { check, finish, openGame, OUT } from './_lib.mjs';

const { browser, page, errors } = await openGame();
await page.evaluate(() => {
  localStorage.removeItem('aow-mech-design');
  localStorage.removeItem('aow-mech-blueprints');
});
await page.mouse.click(640, 300);
const press = async (key, wait = 150) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(wait);
};
const mech = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__aow.state.player.mech)));
const hangarOpen = () => page.evaluate(() => window.__aow.activeScenes().includes('HangarScene'));
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('aow-mech-blueprints') ?? 'null'));
await press('KeyB', 500);
check('B opens the hangar', await hangarOpen());
await page.screenshot({ path: `${OUT}/hangar.png` });
await press('Digit5');
await press('KeyE');
let s = await stored();
check('5, E switches the right arm and keeps the design', s?.slots?.[0]?.design?.right === 'shield', JSON.stringify(s?.slots?.[0]?.design));
// Hover the first arm in the drawer: the preview plays and the bars show ghosts.
await page.mouse.move(180, 135);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/hangar-hover.png` });
await page.mouse.move(640, 700);
await press('KeyT');
await press('Digit1');
await press('KeyE');
s = await stored();
check('T switches blueprint; edits go to the new one', s?.active === 1 && s.slots[1].design.legs !== s.slots[0].design.legs, JSON.stringify(s?.slots?.map((b) => b.design.legs)));
await press('KeyT');
await press('KeyT');
await press('KeyT');
await press('KeyE'); // walker -> treads (open)
await page.evaluate(() => {
  window.__aow.state.player.gold = 0;
});
await press('KeyR');
check('R with no gold does nothing', (await mech()).build === null);
await page.evaluate(() => window.__aow.addGold(5000));
await press('KeyR', 300);
let m = await mech();
check('R builds the Mech', m.build !== null, m.build?.unitId ?? 'none');
await page.screenshot({ path: `${OUT}/hangar-building.png` });
await press('Escape', 300);
check('Esc closes the hangar (and does not pause)', !(await hangarOpen()) && (await page.evaluate(() => window.__aow.snapshot().phase)) === 'playing');
await page.evaluate(() => window.__aow.step(6000));
await page.screenshot({ path: `${OUT}/mech-scaffold.png` });
await page.evaluate(() => window.__aow.step(60000));
m = await mech();
check('the Mech walks out when built', m.alive && m.build === null);
await page.evaluate(() => {
  const u = window.__aow.snapshot().units.find((x) => x.unitId.startsWith('mech:'));
  if (u) window.__aow.kill(u.id);
  window.__aow.step(100);
});
m = await mech();
check('the Mech falls and the hangar frees up', !m.alive && m.build === null);
for (let age = 1; age < 5; age++) {
  await page.evaluate(() => window.__aow.ageUp('player'));
}
await press('KeyB', 600);
await page.screenshot({ path: `${OUT}/hangar-future.png` });
await finish(browser, errors);
