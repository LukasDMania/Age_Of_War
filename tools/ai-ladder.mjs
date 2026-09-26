#!/usr/bin/env node
/**
 * Round robin of the AI profiles (2026-09-26): every profile plays every
 * other, on both sides, `--games` times per side, both sides on the same
 * difficulty so only strategy differs. Prints a win table and each
 * profile's score (win 1, draw 0.5, loss 0).
 *
 * Usage (from the repo root, same Playwright setup as tools/train-ai.mjs):
 *   node tools/ai-ladder.mjs [--difficulty hard] [--games 2] [--workers 3]
 *                            [--minutes 15] [--profiles classic,balanced,...]
 *                            [--no-build] [--out training/ladder.json]
 *
 * It builds a development bundle into training/build-ladder (skip with
 * --no-build when that bundle is current) and plays headless matches through
 * `window.__aowTrain.runMatch`. A match that hits the time limit is judged
 * by base HP (a draw within 10%).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const DIFFICULTY = String(opt('difficulty', 'hard'));
const GAMES = Number(opt('games', 2));
const WORKERS = Number(opt('workers', 3));
const MAX_MINUTES = Number(opt('minutes', 15));
const ONLY = opt('profiles', null);
const OUT = opt('out', null);
const NO_BUILD = Boolean(opt('no-build', false));
// Its own bundle, so it never swaps files under a training run's server.
const BUILD = path.join(ROOT, 'training', 'build-ladder');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!NO_BUILD || !fs.existsSync(path.join(BUILD, 'index.html'))) {
  log('building a development bundle into training/build-ladder');
  const r = spawnSync('npx', ['vite', 'build', '--mode', 'development', '--outDir', BUILD, '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'ignore',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = path.join(BUILD, url === '/' ? 'index.html' : url);
  if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const PORT = server.address().port;

const pw = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright').catch(() => {
  console.error('Playwright not found: npm i -D playwright, or set PLAYWRIGHT_MODULE.');
  process.exit(1);
});
const browser = await pw.chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
async function openPage() {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  await page.route('**/__playtest-log', (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/index.html?ai=off&headless`);
  await page.waitForFunction(() => window.__aowTrain && window.__aow, null, { timeout: 60000 });
  return page;
}
const pages = [];
for (let i = 0; i < WORKERS; i++) pages.push(await openPage());
const all = await pages[0].evaluate(() => window.__aowTrain.profiles.map((p) => ({ id: p.id, label: p.label })));
const wanted = typeof ONLY === 'string' ? ONLY.split(',') : null;
const profiles = wanted ? all.filter((p) => wanted.includes(p.id)) : all;
log(`${profiles.length} profiles on ${DIFFICULTY}: ${profiles.map((p) => p.id).join(', ')}`);

const matches = [];
for (let a = 0; a < profiles.length; a++) {
  for (let b = a + 1; b < profiles.length; b++) {
    for (let g = 0; g < GAMES; g++) {
      matches.push({ player: profiles[a].id, enemy: profiles[b].id });
      matches.push({ player: profiles[b].id, enemy: profiles[a].id });
    }
  }
}
log(`${matches.length} matches`);

const results = new Array(matches.length);
let next = 0;
await Promise.all(
  pages.map(async (_, w) => {
    while (next < matches.length) {
      const i = next++;
      const m = matches[i];
      const data = { ai: DIFFICULTY, playerAi: DIFFICULTY, profile: m.enemy, playerProfile: m.player };
      try {
        results[i] = await pages[w].evaluate(([d, ms]) => window.__aowTrain.runMatch(d, ms), [data, MAX_MINUTES * 60000]);
      } catch (err) {
        log(`worker ${w} failed (${String(err).slice(0, 80)}), reopening`);
        await pages[w].close().catch(() => {});
        pages[w] = await openPage();
        results[i] = { winner: 'draw', timedOut: true, timeMs: 0 };
      }
    }
  }),
);

// score[a][b]: a's points against b.
const score = Object.fromEntries(profiles.map((p) => [p.id, Object.fromEntries(profiles.map((q) => [q.id, 0]))]));
const total = Object.fromEntries(profiles.map((p) => [p.id, { points: 0, games: 0, timeouts: 0, minutes: 0 }]));
results.forEach((r, i) => {
  const { player, enemy } = matches[i];
  const pts = r.winner === 'draw' ? [0.5, 0.5] : r.winner === 'player' ? [1, 0] : [0, 1];
  score[player][enemy] += pts[0];
  score[enemy][player] += pts[1];
  for (const [id, p] of [[player, pts[0]], [enemy, pts[1]]]) {
    total[id].points += p;
    total[id].games++;
    total[id].timeouts += r.timedOut ? 1 : 0;
    total[id].minutes += r.timeMs / 60000;
  }
});
const ranked = [...profiles].sort((a, b) => total[b.id].points - total[a.id].points);
const perPair = 2 * GAMES;
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nPoints out of ${perPair} per pairing (row vs column), ${DIFFICULTY} vs ${DIFFICULTY}:\n`);
console.log(pad('', 12) + ranked.map((p) => pad(p.id.slice(0, 9), 10)).join(''));
for (const a of ranked) {
  console.log(pad(a.id.slice(0, 11), 12) + ranked.map((b) => pad(a.id === b.id ? '-' : score[a.id][b.id], 10)).join(''));
}
console.log('\nOverall:');
for (const p of ranked) {
  const t = total[p.id];
  console.log(
    `  ${pad(p.label, 12)} ${(100 * t.points / t.games).toFixed(0).padStart(3)}%  (${t.points}/${t.games}; ${t.timeouts} hit the time limit; avg ${(t.minutes / t.games).toFixed(1)} min)`,
  );
}
if (typeof OUT === 'string') {
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify({ difficulty: DIFFICULTY, games: GAMES, minutes: MAX_MINUTES, score, total }, null, 1));
  log(`wrote ${OUT}`);
}
await browser.close();
server.close();
