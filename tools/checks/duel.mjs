// Mech vs Mech from the menu: hangar in duel mode, Fight, one round to the end. `node tools/checks/duel.mjs`
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
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/duel-hangar.png` });
await page.mouse.click(420, 26); // next age
await page.waitForTimeout(300);
await page.keyboard.press('KeyR');
await page.waitForFunction(() => window.__aow && window.__aow.snapshot().phase === 'playing', null, { timeout: 30000 });
await page.waitForTimeout(600);
const start = await page.evaluate(() => window.__aow.snapshot().units.map((u) => `${u.side}:${u.unitId}`));
check('the duel starts with one Mech per side and nothing else', start.length === 2 && start.every((u) => u.includes('mech:1:')), start.join(' '));
await page.screenshot({ path: `${OUT}/duel-start.png` });
const end = await page.evaluate(() => {
  const a = window.__aow;
  for (let i = 0; i < 300 && a.snapshot().phase === 'playing'; i++) a.step(1000);
  return { phase: a.snapshot().phase, bases: a.snapshot().baseHp, units: a.snapshot().units.map((u) => u.unitId) };
});
check('the duel ends when a Mech falls', end.phase === 'gameover' && (end.bases.player <= 0 || end.bases.enemy <= 0), JSON.stringify(end));
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/duel-end.png` });
await finish(browser, errors);
