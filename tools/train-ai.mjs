#!/usr/bin/env node
/**
 * Trains the utility AI by self-play (2026-09-26, owner: "do some machine
 * learning if you can"). A genetic algorithm evolves genomes (the brain's
 * weights, see src/config/aiGenome.config.ts): each generation every genome
 * plays headless matches against the classic hard AI, the hand-made
 * profiles and a hall of fame of earlier champions, both difficulties set
 * to hard so only strategy differs. The fittest survive and breed
 * (crossover + mutation). A final exam picks the champion.
 *
 * Fitness per match, from the genome's side: 1 win / 0.5 draw / 0 loss
 * (0.75 / 0.25 when the time limit ended it and base HP decided), plus
 * 0.3 x base HP margin and 0.4 x "pressure" (how far the fighting was pushed
 * toward the enemy base, -0.5..0.5), plus a small bonus for quick wins.
 * The continuous parts matter because equal AIs often stall in the Future
 * age.
 *
 * Usage (from the repo root):
 *   node tools/train-ai.mjs [--generations 24] [--population 20] [--workers 3]
 *                           [--minutes 15] [--seed-hof] [--publish] [--label "Trained"]
 *                           [--id trained] [--fitness balanced|aggressive]
 *
 * It builds a development bundle into training/build, serves it on a local
 * port and drives headless Chromium through Playwright. Playwright: either
 * installed in the project (npm i -D playwright; npx playwright install
 * chromium) or set PLAYWRIGHT_MODULE (path to playwright's index.mjs) and
 * CHROMIUM_PATH. Progress: training/<id>/log.jsonl and state.json (resumes
 * if present). --publish writes the champion into src/config/aiTrained.json
 * (it then shows up as an AI profile in the menu).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---- Options ------------------------------------------------------------- */

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const GENERATIONS = Number(opt('generations', 24));
const POPULATION = Number(opt('population', 20));
const WORKERS = Number(opt('workers', 3));
const MAX_MINUTES = Number(opt('minutes', 15));
const ID = String(opt('id', 'trained'));
const LABEL = String(opt('label', 'Trained'));
const FITNESS = String(opt('fitness', 'balanced'));
const PUBLISH = Boolean(opt('publish', false));
const NO_BUILD = Boolean(opt('no-build', false));
/** Also seed a fresh run with the champions of earlier runs (training/<other id>/champion.json). */
const SEED_HOF = Boolean(opt('seed-hof', false));
const OUT = path.join(ROOT, 'training', ID);
const BUILD = path.join(ROOT, 'training', 'build');
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---- Build and serve ------------------------------------------------------ */

if (!NO_BUILD || !fs.existsSync(path.join(BUILD, 'index.html'))) {
  log('building a development bundle into training/build');
  const r = spawnSync('npx', ['vite', 'build', '--mode', 'development', '--outDir', BUILD, '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json' };
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
log(`serving on ${PORT}`);

/* ---- Browser workers ------------------------------------------------------ */

const pw = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright').catch(() => {
  console.error('Playwright not found: npm i -D playwright, or set PLAYWRIGHT_MODULE.');
  process.exit(1);
});
const browser = await pw.chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  await page.route('**/__playtest-log', (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/index.html?ai=off&headless`);
  await page.waitForFunction(() => window.__aowTrain && window.__aow, null, { timeout: 60000 });
  return page;
}

const pages = [];
for (let i = 0; i < WORKERS; i++) pages.push(await openPage());
const spec = await pages[0].evaluate(() => window.__aowTrain.genomeSpec);
const handProfiles = await pages[0].evaluate(() => window.__aowTrain.profiles);
const GENES = Object.keys(spec);
log(`${GENES.length} genes, ${WORKERS} workers, population ${POPULATION}, ${GENERATIONS} generations`);

/** Runs a list of match setups over the worker pages; results in order. */
async function runAll(setups) {
  const results = new Array(setups.length);
  let next = 0;
  await Promise.all(
    pages.map(async (_, w) => {
      while (next < setups.length) {
        const i = next++;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            results[i] = await pages[w].evaluate(([d, ms]) => window.__aowTrain.runMatch(d, ms), [setups[i], MAX_MINUTES * 60000]);
            break;
          } catch (err) {
            log(`worker ${w} failed (${String(err).slice(0, 80)}), reopening`);
            await pages[w].close().catch(() => {});
            pages[w] = await openPage();
          }
        }
        results[i] ??= { winner: 'draw', timedOut: true, timeMs: 0, hpShare: { player: 1, enemy: 1 }, pressure: 0.5, ages: {} };
      }
    }),
  );
  return results;
}

/* ---- Genomes ---------------------------------------------------------------- */

const norm = (g) => GENES.map((id) => ((g[id] ?? spec[id].base) - spec[id].min) / (spec[id].max - spec[id].min));
const denorm = (v) => Object.fromEntries(GENES.map((id, i) => [id, +(spec[id].min + Math.min(1, Math.max(0, v[i])) * (spec[id].max - spec[id].min)).toFixed(3)]));
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

function mutate(v, sigma, rate = 0.3) {
  return v.map((x) => (Math.random() < rate ? Math.min(1, Math.max(0, x + gauss() * sigma)) : x));
}

function crossover(a, b) {
  return a.map((x, i) => (Math.random() < 0.5 ? x : b[i]));
}

/* ---- Fitness ---------------------------------------------------------------- */

/** Score of one match for the genome playing `side`. */
function score(r, side) {
  const other = side === 'player' ? 'enemy' : 'player';
  let base = r.winner === 'draw' ? 0.5 : r.winner === side ? 1 : 0;
  if (r.timedOut && r.winner !== 'draw') base = r.winner === side ? 0.75 : 0.25;
  const margin = r.hpShare[side] - r.hpShare[other];
  const pressure = (side === 'player' ? r.pressure : 1 - r.pressure) - 0.5;
  const quick = r.winner === side && !r.timedOut ? 0.1 * (1 - r.timeMs / (MAX_MINUTES * 60000)) : 0;
  const w = FITNESS === 'aggressive' ? { margin: 0.3, pressure: 0.8, quick: 0.3 } : { margin: 0.3, pressure: 0.4, quick: 0.1 };
  return base + w.margin * margin + w.pressure * pressure + (w.quick / 0.1) * quick;
}

/** Match setups for one genome: the genome on `side`, an opponent on the other. */
function setup(genome, side, opponent) {
  const d = { ai: 'hard', playerAi: 'hard' };
  if (side === 'enemy') {
    d.genome = genome;
    Object.assign(d, opponent.genome ? { playerGenome: opponent.genome } : { playerProfile: opponent.profile });
  } else {
    d.playerGenome = genome;
    Object.assign(d, opponent.genome ? { genome: opponent.genome } : { profile: opponent.profile });
  }
  return d;
}

const CLASSIC = { name: 'classic', profile: 'classic' };
const HANDS = handProfiles.filter((p) => p.brain === 'utility' && p.genome).map((p) => ({ name: p.id, genome: p.genome }));

function opponentsFor(hof) {
  const list = [
    [CLASSIC, 'enemy'],
    [CLASSIC, 'player'],
  ];
  const shuffled = [...HANDS].sort(() => Math.random() - 0.5).slice(0, 2);
  for (const h of shuffled) list.push([h, Math.random() < 0.5 ? 'enemy' : 'player']);
  const champs = [...hof].sort(() => Math.random() - 0.5).slice(0, 2);
  for (const c of champs) list.push([{ name: 'hof', genome: c }, Math.random() < 0.5 ? 'enemy' : 'player']);
  return list;
}

async function evaluate(population, hof) {
  const setups = [];
  const owners = [];
  population.forEach((ind, i) => {
    for (const [opp, side] of opponentsFor(hof)) {
      setups.push(setup(denorm(ind.v), side, opp));
      owners.push({ i, side, opp: opp.name });
    }
  });
  const results = await runAll(setups);
  const sums = population.map(() => ({ total: 0, n: 0, classicWins: 0, classicN: 0, timeouts: 0 }));
  results.forEach((r, k) => {
    const { i, side, opp } = owners[k];
    const s = sums[i];
    s.total += score(r, side);
    s.n++;
    if (r.timedOut) s.timeouts++;
    if (opp === 'classic') {
      s.classicN++;
      if (r.winner === side) s.classicWins++;
    }
  });
  population.forEach((ind, i) => {
    const s = sums[i];
    ind.fitness = s.total / Math.max(1, s.n);
    ind.classic = `${s.classicWins}/${s.classicN}`;
    ind.timeouts = s.timeouts;
  });
}

/* ---- Evolution ---------------------------------------------------------------- */

const statePath = path.join(OUT, 'state.json');
let state;
if (fs.existsSync(statePath)) {
  state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  log(`resuming at generation ${state.gen}`);
} else {
  const seeds = handProfiles.filter((p) => p.genome).map((p) => norm(p.genome));
  if (SEED_HOF) {
    for (const dir of fs.readdirSync(path.join(ROOT, 'training'))) {
      const file = path.join(ROOT, 'training', dir, 'champion.json');
      if (dir === ID || !fs.existsSync(file)) continue;
      seeds.push(norm(JSON.parse(fs.readFileSync(file, 'utf8')).genome));
      log(`seeded with the champion of ${dir}`);
    }
  }
  const population = seeds.map((v) => ({ v }));
  while (population.length < POPULATION) {
    const seed = seeds[Math.floor(Math.random() * seeds.length)];
    population.push({ v: mutate(seed, 0.25, 0.6) });
  }
  state = { gen: 0, population, hof: [], history: [] };
}

const logPath = path.join(OUT, 'log.jsonl');
const ELITES = 4;
const started = Date.now();
while (state.gen < GENERATIONS) {
  const t0 = Date.now();
  await evaluate(state.population, state.hof.map(denorm));
  state.population.sort((a, b) => b.fitness - a.fitness);
  const best = state.population[0];
  const mean = state.population.reduce((s, p) => s + p.fitness, 0) / state.population.length;
  const entry = {
    gen: state.gen,
    best: +best.fitness.toFixed(3),
    mean: +mean.toFixed(3),
    bestVsClassic: best.classic,
    timeouts: state.population.reduce((s, p) => s + p.timeouts, 0),
    seconds: Math.round((Date.now() - t0) / 1000),
    genome: denorm(best.v),
  };
  state.history.push({ gen: entry.gen, best: entry.best, mean: entry.mean, bestVsClassic: entry.bestVsClassic });
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  log(`gen ${state.gen}: best ${entry.best} (vs classic ${best.classic}) mean ${entry.mean}  ${entry.seconds}s`);
  // Hall of fame: this generation's best joins (at most 6, oldest out).
  state.hof.push(best.v);
  if (state.hof.length > 6) state.hof.shift();
  // Next generation: elites carried over, the rest bred from the top half.
  const sigma = 0.18 * Math.pow(0.93, state.gen);
  const parents = state.population.slice(0, Math.max(ELITES, Math.floor(POPULATION / 2)));
  const pick = () => {
    const a = parents[Math.floor(Math.random() * parents.length)];
    const b = parents[Math.floor(Math.random() * parents.length)];
    return a.fitness > b.fitness ? a : b;
  };
  const next = state.population.slice(0, ELITES).map((p) => ({ v: p.v }));
  while (next.length < POPULATION) next.push({ v: mutate(crossover(pick().v, pick().v), sigma) });
  state.population = next;
  state.gen++;
  fs.writeFileSync(statePath, JSON.stringify(state));
}

/* ---- Final exam ------------------------------------------------------------------ */

log('final exam');
const candidates = [...state.hof.map((v) => ({ v })), ...state.population.slice(0, 4)];
const examOpponents = [CLASSIC, ...HANDS];
const examSetups = [];
const examOwners = [];
candidates.forEach((c, i) => {
  for (const opp of examOpponents) {
    for (const side of ['enemy', 'player', 'enemy', 'player']) {
      examSetups.push(setup(denorm(c.v), side, opp));
      examOwners.push({ i, side, opp: opp.name });
    }
  }
});
const examResults = await runAll(examSetups);
const exam = candidates.map(() => ({ total: 0, n: 0, byOpp: {} }));
examResults.forEach((r, k) => {
  const { i, side, opp } = examOwners[k];
  exam[i].total += score(r, side);
  exam[i].n++;
  const b = (exam[i].byOpp[opp] ??= { wins: 0, games: 0 });
  b.games++;
  if (r.winner === side) b.wins++;
});
let champ = 0;
exam.forEach((e, i) => {
  if (e.total / e.n > exam[champ].total / exam[champ].n) champ = i;
});
const champion = {
  id: ID,
  label: LABEL,
  genome: denorm(candidates[champ].v),
  exam: { fitness: +(exam[champ].total / exam[champ].n).toFixed(3), byOpponent: exam[champ].byOpp },
  generations: state.gen,
  population: POPULATION,
  fitness: FITNESS,
  minutes: Math.round((Date.now() - started) / 60000),
};
fs.writeFileSync(path.join(OUT, 'champion.json'), JSON.stringify(champion, null, 1));
log('champion', JSON.stringify(champion.exam));

if (PUBLISH) {
  const file = path.join(ROOT, 'src', 'config', 'aiTrained.json');
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { profiles: [] };
  const vsClassic = champion.exam.byOpponent.classic;
  const note = `${champion.generations} generations x ${POPULATION} genomes of self-play (${FITNESS} fitness); exam vs classic hard: ${vsClassic?.wins ?? 0}/${vsClassic?.games ?? 0} wins`;
  const all = Object.values(champion.exam.byOpponent).reduce((t, b) => ({ wins: t.wins + b.wins, games: t.games + b.games }), { wins: 0, games: 0 });
  const entry = {
    id: ID,
    label: LABEL,
    // Short: the menu shows it on one line.
    description: `Evolved by self-play (${champion.generations} generations); won ${all.wins} of ${all.games} exam games.`,
    genome: champion.genome,
    note,
  };
  data.profiles = [...(data.profiles ?? []).filter((p) => p.id !== ID), entry];
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  log(`published ${ID} to src/config/aiTrained.json`);
}

await browser.close();
server.close();
