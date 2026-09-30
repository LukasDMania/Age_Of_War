// Mech expansion parts and modules in a real lane, driven headlessly: `node tools/checks/mechparts.mjs`
import { check, finish, openGame } from './_lib.mjs';

const { browser, page, errors } = await openGame();

/** Clean lane, a player Mech at x, enemy units at xs; returns ids. */
const setup = (mechId, mechX, enemyId, enemyXs) =>
  page.evaluate(
    ({ mechId, mechX, enemyId, enemyXs }) => {
      window.__aow.restart({ ai: 'off' });
      return new Promise((resolve) =>
        setTimeout(() => {
          // The restart installs a fresh handle.
          const a = window.__aow;
          a.state.player.gold = 0;
          a.state.enemy.gold = 0;
          a.spawn(mechId, 'player');
          const mech = a.snapshot().units.find((u) => u.unitId === mechId);
          a.place(mech.id, mechX);
          a.state.player.mech.alive = true;
          const enemies = [];
          for (const x of enemyXs) {
            a.spawn(enemyId, 'enemy');
            const u = a.snapshot().units.filter((u) => u.side === 'enemy').at(-1);
            a.place(u.id, x);
            enemies.push(u.id);
          }
          resolve({ mech: mech.id, enemies });
        }, 400),
      );
    },
    { mechId, mechX, enemyId, enemyXs },
  );
const units = () => page.evaluate(() => window.__aow.snapshot().units);
const step = (ms) => page.evaluate((ms) => window.__aow.step(ms), ms);
const byId = async (id) => (await units()).find((u) => u.id === id);
const fx = () =>
  page.evaluate(() => {
    const seen = [];
    window.__fx = seen;
    window.__aow.bus.on('weapon-fx', (p) => seen.push(p.kind));
    window.__aow.bus.on('mech-ability-used', (p) => seen.push(`ability:${p.kind}`));
  });
const seen = () => page.evaluate(() => window.__fx);
const M = (legs, torso, head, left, right, module = 'none') => `mech:0:${legs}:${torso}:${head}:${left}:${right}:${module}`;

// Flamethrower: burns (damage keeps coming after the flames stop).
let ids = await setup(M('walker', 'frame', 'visor', 'flamer', 'shield'), 400, 'stone-mammoth-rider', [470, 500]);
await fx();
await step(1500);
let e = await Promise.all(ids.enemies.map(byId));
check('flamethrower hits the whole cone', e.every((u) => !u || u.hp < u.maxHp), e.map((u) => u && `${Math.round(u.hp)}/${u.maxHp}`).join(' '));
check('flames show', (await seen()).includes('flame'));

// Tesla: lightning jumps.
ids = await setup(M('walker', 'frame', 'visor', 'tesla', 'shield'), 400, 'stone-clubber', [520, 545, 570, 595]);
await fx();
await step(1200);
e = await Promise.all(ids.enemies.map(byId));
check('tesla chain hurts 3+ enemies', e.filter((u) => !u || u.hp < u.maxHp).length >= 3, e.map((u) => u && Math.round(u.hp)).join(' '));

// Wrecking ball: knockback.
ids = await setup(M('walker', 'frame', 'visor', 'wrecker', 'shield'), 400, 'stone-mammoth-rider', [470]);
await fx();
const before = (await byId(ids.enemies[0])).x;
await step(1500);
let after = await byId(ids.enemies[0]);
check('wrecking ball knocks back', (await seen()).includes('knockback'), `x ${before} -> ${after?.x}`);

// Grapple: pulls the back one forward.
ids = await setup(M('walker', 'frame', 'visor', 'shield', 'grapple'), 400, 'stone-slinger', [560, 640]);
await fx();
await step(800);
after = await byId(ids.enemies[1]);
check('grapple pulls the back-line enemy in', (await seen()).includes('pull') && after && after.x < 600, `x 640 -> ${after?.x}`);

// Minigun: spins up (shots speed up).
ids = await setup(M('walker', 'frame', 'visor', 'shield', 'minigun'), 400, 'stone-mammoth-rider', [540]);
const shots = await page.evaluate(() => {
  const times = [];
  window.__aow.bus.on('unit-struck', (p) => { if (p.unitId.startsWith('mech:')) times.push(window.__aow.snapshot().elapsedMs); });
  window.__aow.step(3500);
  return times;
});
const gaps = shots.slice(1).map((t, i) => t - shots[i]);
check('minigun spins up', gaps.length > 4 && gaps.at(-1) < gaps[0] * 0.5, gaps.map((g) => Math.round(g)).join(','));

// Railgun: pierces.
ids = await setup(M('walker', 'frame', 'visor', 'shield', 'railgun'), 400, 'stone-clubber', [600, 640, 680]);
await step(1500);
e = await Promise.all(ids.enemies.map(byId));
check('railgun pierces the line', e.filter((u) => !u || u.hp < u.maxHp).length === 3, e.map((u) => u && Math.round(u.hp)).join(' '));

// Sniper scope: the launcher hits the back one first.
ids = await setup(M('walker', 'frame', 'scope', 'shield', 'launcher'), 400, 'stone-mammoth-rider', [540, 630]);
await step(900);
e = await Promise.all(ids.enemies.map(byId));
check('sniper scope hits the back line', e[1] && e[1].hp < e[1].maxHp && e[0].hp === e[0].maxHp, e.map((u) => u && Math.round(u.hp)).join(' '));

// Jump legs: leap over the front line.
ids = await setup(M('jump', 'frame', 'visor', 'fist', 'shield'), 400, 'stone-clubber', [470, 500, 530]);
await fx();
await step(2500);
const mech = await byId(ids.mech);
check('jump legs leap over the front line', (await seen()).includes('land') && mech && mech.x > 470, `mech x ${mech?.x}`);

// Troop carrier: drops 3 clubbers when it stops.
ids = await setup(M('walker', 'carrier', 'visor', 'fist', 'shield'), 400, 'stone-mammoth-rider', [480]);
await step(600);
const troops = (await units()).filter((u) => u.side === 'player' && u.unitId === 'stone-clubber').length;
check('troop carrier drops 3 troops', troops === 3, `${troops}`);

// Hangar bay: drones.
await fx(); // before the setup: the first drone goes while the page still runs in real time
ids = await setup(M('walker', 'bay', 'visor', 'shield', 'shield'), 400, 'stone-mammoth-rider', [620]);
await step(1500);
check('hangar bay launches a drone', (await seen()).includes('drone'));

// Overcharge: drains, not below 30%.
ids = await setup(M('walker', 'overcharge', 'visor', 'shield', 'shield'), 400, 'stone-clubber', []);
await step(90000);
const oc = await byId(ids.mech);
check('overcharge drains to its floor only', oc && Math.abs(oc.hp / oc.maxHp - 0.3) < 0.02, oc && `${Math.round(oc.hp)}/${oc.maxHp}`);

// Salvage: extra gold.
ids = await setup(M('walker', 'frame', 'salvage', 'fist', 'shield'), 400, 'stone-clubber', [480]);
await step(8000);
const gold = await page.evaluate(() => window.__aow.state.player.gold);
check('salvage pays extra kill gold (a clubber pays 12.5)', gold > 20, `gold ${gold}`);

// Taunt: an enemy slinger shoots the Mech rather than the unit in front.
ids = await setup(M('walker', 'frame', 'taunt', 'shield', 'shield'), 360, 'stone-slinger', [520]);
await page.evaluate(() => {
  window.__aow.spawn('stone-mammoth-rider', 'player');
  const u = window.__aow.snapshot().units.filter((u) => u.side === 'player').at(-1);
  window.__aow.place(u.id, 450);
  window.__aow.state.player.mech.alive = true;
});
await step(3000);
const hurt = (await units()).filter((u) => u.side === 'player' && u.hp < u.maxHp).map((u) => u.unitId.split(':')[0]);
check('taunt beacon draws fire', hurt.includes('mech') && !hurt.includes('stone-mammoth-rider'), hurt.join(','));

// Modules.
for (const [module, enemyXs, enemy] of [
  ['smoke', [520], 'stone-slinger'],
  ['overdrive', [470], 'stone-clubber'],
  ['leap', [700], 'stone-clubber'],
  ['overload', [470], 'stone-clubber'],
  ['dome', [700], 'stone-clubber'],
  ['emp', [470], 'stone-mammoth-rider'],
  ['orbital', [700], 'stone-clubber'],
]) {
  ids = await setup(M('walker', 'frame', 'visor', 'fist', 'shield', module), 400, enemy, enemyXs);
  await fx();
  await step(100);
  await page.evaluate(() => window.__aow.bus.emit('mech-ability-requested', { side: 'player' }));
  await step(1000);
  const cd = await page.evaluate(() => window.__aow.state.player.mech.abilityReadyAt - window.__aow.snapshot().elapsedMs);
  check(`module ${module} fires`, (await seen()).includes(`ability:${module}`) && cd > 5000, `cooldown left ${Math.round(cd)}`);
}
await finish(browser, errors);
