// Effects review: fires effect events at fixed spots in slow motion and saves screenshots to out/fx-*.png.
// `node tools/checks/effects.mjs` then look at the images (nothing is asserted but page errors).
import { finish, openGame, OUT } from './_lib.mjs';

const { browser, page, errors } = await openGame();
await page.evaluate(() => window.__aow.fxTimeScale(0.12));
const LANE = await page.evaluate(async () => (await import('/src/config/constants.ts')).LANE_Y);
const show = async (name, events, waits = [150, 700]) => {
  await page.evaluate(
    ([events, LANE]) => {
      for (const [ev, p] of events) {
        window.__aow.bus.emit(ev, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('LANE') ? LANE + Number(v.slice(4)) : v])));
      }
    },
    [events, LANE],
  );
  for (const [i, w] of waits.entries()) {
    await page.waitForTimeout(w);
    await page.screenshot({ path: `${OUT}/fx-${name}-${i}.png`, clip: { x: 200, y: 330, width: 880, height: 240 } });
  }
};
const struck = (x, unitId, slot, extra = {}) => ['unit-struck', { side: 'player', instanceId: 0, unitId, slot, x, frontX: x + 14, ranged: false, ...extra }];
await show('slash', [struck(300, 'stone-clubber', 1), struck(420, 'castle-swordsman', 1), struck(540, 'stone-mammoth-rider', 3), struck(780, 'future-blade-trooper', 1)]);
await show('muzzle', [
  struck(300, 'renaissance-musketeer', 2, { ranged: true, muzzleX: 340, muzzleY: 'LANE-49', projectileKey: 'proj-bullet' }),
  struck(460, 'modern-tank', 3, { ranged: true, muzzleX: 515, muzzleY: 'LANE-38', projectileKey: 'proj-shell' }),
  struck(620, 'future-laser-gunner', 2, { ranged: true, muzzleX: 653, muzzleY: 'LANE-49', projectileKey: 'proj-laser' }),
  struck(760, 'future-mech', 3, { ranged: true, muzzleX: 800, muzzleY: 'LANE-68', projectileKey: 'proj-plasma' }),
]);
await show('boom', [
  ['projectile-impact', { side: 'player', key: 'proj-shell', x: 330, y: 'LANE-1', radius: 28, target: 'ground' }],
  ['projectile-impact', { side: 'player', key: 'proj-cannonball', x: 520, y: 'LANE-1', radius: 0, target: 'ground' }],
  ['projectile-impact', { side: 'player', key: 'proj-plasma', x: 700, y: 'LANE-30', radius: 28, target: 'unit' }],
], [150, 900, 3000]);
await show('death', [
  ['unit-died', { side: 'enemy', unitId: 'castle-knight', instanceId: 2, killerSide: 'player', x: 450 }],
  ['unit-died', { side: 'enemy', unitId: 'modern-tank', instanceId: 3, killerSide: 'player', x: 700 }],
  ['shot-bounced', { side: 'player', fromX: 850, fromY: 'LANE-30', toX: 940, toY: 'LANE-28' }],
], [150, 1200]);
await show('sky', [['special-fired', { side: 'player', age: 0 }]], [200, 1500]);
console.log(`screenshots in ${OUT}`);
await finish(browser, errors);
