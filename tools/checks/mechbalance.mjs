// Mech balance (headless): a Mech vs an equal-gold stream of its age's melee,
// ranged and heavy units, no turrets, no AI. Prints the Mech's HP left when
// the stream is spent (negative: the share of the stream's gold still alive
// when the Mech fell). `node tools/checks/mechbalance.mjs [ages=0,3]`
import { finish, openGame } from './_lib.mjs';

const ages = (process.argv[2] ?? '0,3').split(',').map(Number);
const BASE = { legs: 'walker', torso: 'frame', head: 'visor', left: 'fist', right: 'launcher', module: 'none' };
const VARIANTS = [
  ['default', {}],
  ['treads+hull+shield', { legs: 'treads', torso: 'hull', left: 'shield' }],
  ['hover', { legs: 'hover' }],
  ['spider', { legs: 'spider' }],
  ['jump', { legs: 'jump' }],
  ['bay', { torso: 'bay' }],
  ['overcharge', { torso: 'overcharge' }],
  ['carrier', { torso: 'carrier' }],
  ['scope', { head: 'scope' }],
  ['taunt', { head: 'taunt' }],
  ['salvage', { head: 'salvage' }],
  ['flamer', { left: 'flamer' }],
  ['minigun', { right: 'minigun' }],
  ['tesla', { left: 'tesla' }],
  ['railgun', { right: 'railgun' }],
  ['grapple', { right: 'grapple' }],
  ['wrecker', { left: 'wrecker' }],
];

const { browser, page, errors } = await openGame();
for (const age of ages) {
  for (const [name, change] of VARIANTS) {
    const design = { ...BASE, ...change };
    const result = await page.evaluate(
      async ({ design, age }) => {
        const defs = await import('/src/entities/unitDefinitions.ts');
        const md = await import('/src/entities/mechDesign.ts');
        const ages = await import('/src/config/ages.config.ts');
        window.__aow.restart({ ai: 'off' });
        await new Promise((r) => setTimeout(r, 300));
        const a = window.__aow;
        a.pause();
        const def = md.mechDefinition(design, age);
        a.spawn(def.id, 'player');
        a.state.player.mech.alive = true;
        const stream = ages.AGES[age].unitIds.slice(0, 3);
        let budget = def.cost;
        let spent = 0;
        let i = 0;
        let t = 0;
        const mech = () => a.snapshot().units.find((u) => u.unitId === def.id);
        a.resume();
        while (t < 400000) {
          const m = mech();
          if (!m) break;
          const next = defs.getUnitDefinition(stream[i % 3]);
          if (budget >= next.cost && a.snapshot().units.filter((u) => u.side === 'enemy').length < 6) {
            if (a.spawn(next.id, 'enemy')) {
              budget -= next.cost;
              spent += next.cost;
              i++;
            }
          }
          a.step(500);
          t += 500;
          const enemies = a.snapshot().units.filter((u) => u.side === 'enemy');
          if (budget < defs.getUnitDefinition(stream[0]).cost && enemies.length === 0) break;
        }
        const m = mech();
        const alive = a.snapshot().units.filter((u) => u.side === 'enemy').reduce((s, u) => s + defs.getUnitDefinition(u.unitId).cost, 0);
        return { cost: def.cost, hpLeft: m ? m.hp / m.maxHp : -(alive + budget) / def.cost, seconds: t / 1000, spent: spent / def.cost };
      },
      { design, age },
    );
    console.log(`age ${age}  ${name.padEnd(20)} cost ${String(result.cost).padStart(6)}  ${result.hpLeft >= 0 ? `won, ${Math.round(result.hpLeft * 100)}% HP left` : `lost, ${Math.round(-result.hpLeft * 100)}% of the stream left`}  (${result.seconds}s, ${Math.round(result.spent * 100)}% of the stream sent)`);
  }
}
await finish(browser, errors);
