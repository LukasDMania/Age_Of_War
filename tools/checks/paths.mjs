// Conquest archetype paths: offers lean and never lock; behaviour traits work in battle. `node tools/checks/paths.mjs`
import { check, finish, openGame } from './_lib.mjs';

const { browser, page, errors } = await openGame();
const offers = await page.evaluate(async () => {
  const cs = await import('/src/state/conquestState.ts');
  const cfg = await import('/src/config/conquest.config.ts');
  cs.resetConquest();
  const run = cs.startRun('chieftain', 0);
  const pathOf = (id) => cfg.RELICS.find((r) => r.id === id)?.path ?? 'general';
  const isKey = (id) => cfg.RELICS.find((r) => r.id === id)?.keystone;
  const tally = (r, n) => {
    const t = {};
    let mono = 0;
    let twoKeys = 0;
    for (let i = 0; i < n; i++) {
      const offer = cs.rollRelics(r, true);
      const paths = offer.map(pathOf);
      if (offer.length > 1 && paths.every((p) => p === paths[0] && p !== 'general')) mono++;
      if (offer.filter(isKey).length > 1) twoKeys++;
      for (const p of paths) t[p] = (t[p] ?? 0) + 1;
    }
    return { t, mono, twoKeys };
  };
  const vanguard = { ...run, relics: ['honed-edge', 'shield-wall'], upgrades: { sergeants: 2 } };
  const withKeystone = { ...vanguard, relics: [...vanguard.relics, 'horde'] };
  let keystones = 0;
  for (let i = 0; i < 1000; i++) if (cs.rollRelics(withKeystone, true).some(isKey)) keystones++;
  cs.resetConquest();
  return { fresh: tally(run, 2000), lean: tally(vanguard, 2000), keystones, counts: cs.pathCounts(vanguard) };
});
check('pathCounts counts relics and camp levels', offers.counts.vanguard === 4, JSON.stringify(offers.counts));
check('offers lean toward owned paths', offers.lean.t.vanguard > 1.5 * offers.fresh.t.vanguard, `${offers.fresh.t.vanguard} -> ${offers.lean.t.vanguard}`);
check('never an all-one-path offer', offers.fresh.mono + offers.lean.mono === 0);
check('never two keystones in an offer', offers.fresh.twoKeys + offers.lean.twoKeys === 0);
check('no keystone offered once one is owned', offers.keystones === 0);

const battle = async (effects) => {
  await page.evaluate((effects) => window.__aow.restart({ ai: 'off', conquest: { effects, label: 'check' } }), effects);
  await page.waitForFunction(() => window.__aow.snapshot().phase === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => window.__aow.step(100));
};
const P = 'player';
await battle([{ kind: 'unit-cost', side: P, mult: 0.6, slots: [1] }]);
const paid = await page.evaluate(() => {
  const s = window.__aow.state.player;
  const before = s.gold;
  window.__aow.buy('stone-clubber');
  return before - s.gold;
});
check('unit-cost: a clubber costs 12', paid === 12, String(paid));
await battle([
  { kind: 'turret-bounce', side: P, share: 0.5, kinds: ['rapid'] },
  { kind: 'turret-veterans', side: P, kills: 2 },
  { kind: 'turret-damage', side: P, mult: 3 },
  { kind: 'turrets', side: P, count: 1, turretKind: 'rapid', level: 0 },
]);
const turret = await page.evaluate(() => {
  let bounces = 0;
  window.__aow.bus.on('shot-bounced', () => bounces++);
  for (let i = 0; i < 6; i++) {
    for (let t = 0; t < 40 && !window.__aow.spawn('stone-clubber', 'enemy'); t++) window.__aow.step(100);
    window.__aow.step(900);
  }
  window.__aow.step(30000);
  return { bounces, level: window.__aow.state.player.turrets[0]?.level ?? 0 };
});
check('ricochet and veteran crews', turret.bounces > 0 && turret.level > 0, JSON.stringify(turret));
await finish(browser, errors);
