// Measures where each ranged unit's shot leaves its art (after changing ranged art). `node tools/checks/muzzles.mjs`
// Copy the printed numbers into the units' `attack.muzzle` (entities/unitDefinitions.ts) and
// MECH_LAUNCHER_MUZZLES (config/mech.config.ts). The catapult's is set by hand (see its row).
import { finish, openGame, OUT } from './_lib.mjs';

const { browser, page, errors } = await openGame('artlab.html?muzzles', { width: 1400, height: 600 });
await page.waitForFunction(() => window.__labReady && window.__muzzles, null, { timeout: 60000 });
console.log(JSON.stringify(await page.evaluate(() => window.__muzzles), null, 1));
await page.locator('#lab').screenshot({ path: `${OUT}/muzzles.png` });
await finish(browser, errors);
