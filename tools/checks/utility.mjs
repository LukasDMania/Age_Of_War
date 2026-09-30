// The utility Mech (Mech expansion section 7): works at a building, can't be hit, switches, powers down. `node tools/checks/utility.mjs`
import { check, finish, openGame, OUT } from './_lib.mjs';

const { browser, page, errors } = await openGame();
const r = await page.evaluate(async () => {
  window.__aow.restart({ ai: 'off' });
  await new Promise((res) => setTimeout(res, 400));
  const a = window.__aow;
  const out = {};
  const bs = await import('/src/systems/BuildingSystem.ts');
  const design = { legs: 'walker', torso: 'frame', head: 'foreman', left: 'wrench', right: 'crane', module: 'rush' };
  a.unlockAll();
  a.addGold(20000);
  a.upgradeBuilding('mine');
  const me = a.state.player;
  out.minePriceBefore = bs.buildingPrice(me, 'mine');
  const mineRateBefore = bs.mineGoldPerSec(me);
  a.bus.emit('build-mech-requested', { side: 'player', design });
  a.step(50000); // build 22.5 s + the walk back to the Mine
  const mech = () => a.snapshot().units.find((u) => u.unitId.startsWith('mech:'));
  out.assist = JSON.parse(JSON.stringify(me.mech.assist));
  out.mechX = mech()?.x;
  out.minePriceAt = bs.buildingPrice(me, 'mine');
  out.mineRate = [mineRateBefore, bs.mineGoldPerSec(me)];
  // An enemy right beside it can't hit it.
  a.spawn('stone-slinger', 'enemy');
  const enemy = a.snapshot().units.find((u) => u.side === 'enemy');
  a.place(enemy.id, out.mechX + 30);
  const hpBefore = mech().hp;
  a.step(3000);
  out.hpKept = mech().hp === hpBefore;
  // Repair.
  a.damageBase('player', 300);
  const baseBefore = a.snapshot().baseHp.player;
  a.step(3000);
  out.repaired = a.snapshot().baseHp.player - baseBefore;
  // Switch to the Forge and rush it.
  a.bus.emit('mech-assist-requested', { side: 'player', buildingId: 'forge' });
  a.step(8000);
  out.switched = JSON.parse(JSON.stringify(me.mech.assist));
  const forgeBefore = me.buildings.forge;
  a.bus.emit('mech-ability-requested', { side: 'player' });
  a.step(100);
  out.rushed = me.buildings.forge - forgeBefore;
  // Life runs out: it powers down, nobody is paid.
  const enemyGold = a.state.enemy.gold;
  a.step(90000);
  out.gone = !mech() && !me.mech.alive && me.mech.assist === null;
  out.enemyGoldSame = a.state.enemy.gold === enemyGold;
  out.losses = a.stats('player').losses;
  return out;
});
check('it goes to the Mine by itself and works there', r.assist?.buildingId === 'mine' && r.assist.working && r.mechX < 0, JSON.stringify(r.assist) + ` x ${r.mechX}`);
check('the Mine earns 75% more while it works', Math.abs(r.mineRate[1] / r.mineRate[0] - 1.75) < 0.01, r.mineRate.join(' -> '));
check('the Crane arm cuts the Mine upgrade 20%', Math.abs(r.minePriceAt / r.minePriceBefore - 0.8) < 0.06, `${r.minePriceBefore} -> ${r.minePriceAt}`);
check('enemies cannot hurt it', r.hpKept);
check('the Wrench arm repairs the base', r.repaired > 0, `+${Math.round(r.repaired)}`);
check('a click sends it to another building', r.switched?.buildingId === 'forge' && r.switched.working, JSON.stringify(r.switched));
check('Rush order: a free Forge level', r.rushed === 1);
check('it powers down after its life, paying nobody', r.gone && r.enemyGoldSame && r.losses === 0, JSON.stringify(r));
await page.evaluate(() => window.__aow.unlockAll(false));
await finish(browser, errors);
