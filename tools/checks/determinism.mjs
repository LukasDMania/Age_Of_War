// Lockstep groundwork (2026-10-05): the same seed and the same commands must
// give the same battle, however the time is cut into frames. Plays an AI-vs-AI
// match (both AIs' requests are the commands) three times and compares the
// state hash every 10 s of simulation. `node tools/checks/determinism.mjs`
import { check, finish, openGame } from './_lib.mjs';

const SEED = 12345;
const MILESTONE_TICKS = 600; // 10 s at 60 Hz
const MILESTONES = 48; // 8 minutes

const { browser, page, errors } = await openGame(`?ai=normal`);

/**
 * Restarts with `data`, stops real-time stepping, then steps the match in
 * chunks (`pattern`, ms, cycled) and records the hash at each milestone tick.
 */
async function run(data, pattern) {
  await page.evaluate((d) => {
    window.__aowBefore = window.__aow;
    window.__aow.restart(d);
  }, data);
  // Freeze real-time stepping as soon as the new match is up.
  await page.waitForFunction(
    () => {
      const a = window.__aow;
      if (!a || a === window.__aowBefore || a.snapshot().phase !== 'playing') return false;
      a.setSpeed(0);
      return true;
    },
    null,
    { timeout: 30000, polling: 'raf' },
  );
  return page.evaluate(
    ({ pattern, milestoneTicks, milestones }) => {
      const a = window.__aow;
      a.setSpeed(0);
      const tickMs = 1000 / 60;
      const hashes = [];
      let i = 0;
      for (let m = 1; m <= milestones && a.snapshot().phase === 'playing'; m++) {
        const target = m * milestoneTicks;
        // Cut the time unevenly, then finish the milestone tick by tick.
        while (a.tick() + Math.ceil(pattern[i % pattern.length] / tickMs) + 1 < target && a.snapshot().phase === 'playing') {
          a.step(pattern[i++ % pattern.length]);
        }
        while (a.tick() < target && a.snapshot().phase === 'playing') a.step(tickMs);
        hashes.push(`${a.tick()}:${a.hash()}`);
      }
      const s = a.snapshot();
      return { hashes, phase: s.phase, ages: [s.sides.player.age, s.sides.enemy.age], units: s.units.length };
    },
    { pattern, milestoneTicks: MILESTONE_TICKS, milestones: MILESTONES },
  );
}

const scenarios = [
  { label: 'classic AIs', match: { ai: 'normal', playerAi: 'hard', seed: SEED } },
  { label: 'utility AIs', match: { ai: 'hard', playerAi: 'hard', profile: 'economist', playerProfile: 'warlord', seed: SEED + 7 } },
];
for (const { label, match } of scenarios) {
  const a = await run(match, [1000 / 60]);
  const b = await run(match, [7, 33.3, 250, 1000 / 60, 91, 4]);
  const c = await run({ ...match, seed: match.seed + 1 }, [1000 / 60]);
  console.log(`${label}, run A: ${a.hashes.length} milestones, ${a.phase}, ages ${a.ages}, last ${a.hashes.at(-1)}`);
  check(`${label}: the match got going`, a.hashes.length >= 6, `${a.hashes.length} milestones`);
  const firstDiff = a.hashes.findIndex((h, i) => h !== b.hashes[i]);
  check(
    `${label}: same seed, frames cut differently: identical hashes at every milestone`,
    firstDiff === -1 && a.hashes.length === b.hashes.length,
    firstDiff === -1 ? '' : `first diff at milestone ${firstDiff + 1}: ${a.hashes[firstDiff]} vs ${b.hashes[firstDiff]}`,
  );
  check(`${label}: another seed plays a different match`, a.hashes.some((h, i) => h !== c.hashes[i]));
}
await finish(browser, errors);
