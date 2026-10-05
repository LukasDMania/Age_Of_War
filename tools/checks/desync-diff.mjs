// Desync hunting (2026-10-05): plays one seeded AI-vs-AI match four times to
// tick T (default 1800), cutting the time into frames differently each run,
// then prints each run's hash and the fields where runs A and B differ.
// Halve T until the first differing tick shows what drifted.
// `node tools/checks/desync-diff.mjs 1800`
import { openGame } from './_lib.mjs';
const { browser, page } = await openGame(`?ai=normal`);
async function dumpAt(data, pattern, T) {
  await page.evaluate((d) => { window.__aowBefore = window.__aow; window.__aow.restart(d); }, data);
  await page.waitForFunction(() => { const a = window.__aow; if (!a || a === window.__aowBefore || a.snapshot().phase !== 'playing') return false; a.setSpeed(0); return true; }, null, { timeout: 30000, polling: 'raf' });
  return page.evaluate(({ pattern, T }) => {
    const a = window.__aow; const tickMs = 1000 / 60; let i = 0;
    while (a.tick() + Math.ceil(pattern[i % pattern.length] / tickMs) + 1 < T && a.snapshot().phase === 'playing') a.step(pattern[i++ % pattern.length]);
    while (a.tick() < T && a.snapshot().phase === 'playing') a.step(tickMs);
    const s = a.snapshot();
    return { tick: a.tick(), hash: a.hash(), state: JSON.parse(JSON.stringify({ p: a.state.player, e: a.state.enemy })), units: s.units };
  }, { pattern, T });
}
const match = { ai: 'normal', playerAi: 'hard', seed: 12345 };
const pats = { A: [1000 / 60], A2: [1000 / 60], B: [7, 33.3, 250, 1000 / 60, 91, 4], C: [1000 / 30] };
const T = Number(process.argv[2] ?? 1800);
const res = {};
for (const [k, p] of Object.entries(pats)) res[k] = await dumpAt(match, p, T);
for (const k of Object.keys(res)) console.log(k, res[k].tick, res[k].hash);
const diff = (x, y, path = '') => {
  if (JSON.stringify(x) === JSON.stringify(y)) return;
  if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) { console.log(' ', path, JSON.stringify(x), '!=', JSON.stringify(y)); return; }
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) diff(x[key], y[key], `${path}.${key}`);
};
diff({ s: res.A.state, u: res.A.units }, { s: res.B.state, u: res.B.units });
await browser.close();
