/**
 * Dev-only harness for AI training and balance runs (`window.__aowTrain`).
 * Drives whole matches through the debug handle (`window.__aow`): restart
 * with the given setup, step the simulation to the end (or a time limit),
 * report the result. Used by `tools/train-ai.mjs` from headless Chromium.
 */
import { GENOME_SPEC, AI_PROFILES } from '@config/aiGenome.config';
import { BASE_X, baseMaxHp } from '@config/constants';
import type { GameSceneData } from '@/scenes/GameScene';
import type { DebugHandle } from '@utils/debug';

export interface MatchResult {
  winner: 'player' | 'enemy' | 'draw';
  /** True when the time limit ended it (winner judged by base HP). */
  timedOut: boolean;
  timeMs: number;
  hpShare: { player: number; enemy: number };
  ages: { player: number; enemy: number };
  /**
   * Where the fighting was, averaged over the match: 0 at the player's base,
   * 1 at the enemy's (the middle of the two front lines, or a base when one
   * side had no units out). Above 0.5 means the player had the upper hand.
   */
  pressure: number;
}

type Win = Window & { __aow?: DebugHandle; __aowTrain?: unknown };

const frame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function waitForFreshMatch(previous: DebugHandle | undefined): Promise<DebugHandle> {
  const w = window as Win;
  for (let i = 0; i < 2000; i++) {
    const handle = w.__aow;
    if (handle && handle !== previous) {
      const snap = handle.snapshot();
      if (snap.phase === 'playing') return handle;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('match did not start');
}

/** Plays one match to the end. `maxMs` is simulation time. */
async function runMatch(data: GameSceneData, maxMs = 20 * 60 * 1000, chunkMs = 5000): Promise<MatchResult> {
  const w = window as Win;
  const before = w.__aow;
  if (!before) throw new Error('no debug handle');
  before.restart(data);
  const aow = await waitForFreshMatch(before);
  let snap = aow.snapshot();
  let pressureSum = 0;
  let samples = 0;
  const span = BASE_X.enemy - BASE_X.player;
  while (snap.phase === 'playing' && snap.elapsedMs < maxMs) {
    aow.step(chunkMs);
    snap = aow.snapshot();
    let playerFront = BASE_X.player;
    let enemyFront = BASE_X.enemy;
    for (const u of snap.units) {
      if (u.side === 'player') playerFront = Math.max(playerFront, u.x);
      else enemyFront = Math.min(enemyFront, u.x);
    }
    pressureSum += ((playerFront + enemyFront) / 2 - BASE_X.player) / span;
    samples++;
    await frame();
  }
  const share = {
    player: Math.max(0, snap.baseHp.player) / baseMaxHp(snap.sides.player.age),
    enemy: Math.max(0, snap.baseHp.enemy) / baseMaxHp(snap.sides.enemy.age),
  };
  const timedOut = snap.phase === 'playing';
  let winner: MatchResult['winner'];
  if (!timedOut) winner = snap.baseHp.enemy <= 0 ? 'player' : 'enemy';
  else winner = Math.abs(share.player - share.enemy) < 0.1 ? 'draw' : share.player > share.enemy ? 'player' : 'enemy';
  return {
    winner,
    timedOut,
    timeMs: snap.elapsedMs,
    hpShare: share,
    ages: { player: snap.sides.player.age, enemy: snap.sides.enemy.age },
    pressure: samples > 0 ? pressureSum / samples : 0.5,
  };
}

export function installTrainHarness(): void {
  (window as Win).__aowTrain = {
    runMatch,
    genomeSpec: GENOME_SPEC,
    profiles: AI_PROFILES.map((p) => ({ id: p.id, label: p.label, brain: p.brain, genome: p.genome ?? null })),
  };
}
