/**
 * Conquest mode's run and meta state (prototype, feature `conquest`). Plain
 * data kept in localStorage between matches and page loads: the run in
 * progress (`aow-conquest-run`) and what carries over between runs
 * (`aow-conquest-meta`: Glory, unlocks, ascension). Nothing here touches a
 * match; `systems/experimental/ConquestSystem.ts` applies a battle's effects.
 *
 * The flow: `startRun` rolls the first stage's nodes; `chooseNode` picks the
 * next battle; `finishBattle` records the result (a win pays Glory and rolls
 * relic options, a loss ends the run); `pickRelic` takes one and rolls the
 * next stage's nodes; after the last stage the run is won.
 */
import { AI_PROFILES } from '@config/aiGenome.config';
import type { AiDifficultyName } from '@config/ai.config';
import {
  ASCENSION,
  CONQUEST_ENEMY_PROFILES,
  GLORY,
  GLORY_UNLOCKS,
  LATE_START,
  MUTATORS,
  RELIC_CHOICES,
  RELICS,
  RUN_STAGES,
  type ConquestEffect,
  type Relic,
} from '@config/conquest.config';

/** One battle on offer. */
export interface ConquestNode {
  difficulty: AiDifficultyName;
  /** Enemy AI profile id. */
  profile: string;
  mutators: string[];
  /** 0 = the Stone age, as usual. */
  startAge: number;
  /** Glory a win pays. */
  glory: number;
}

export type RunStatus = 'choosing' | 'battle' | 'reward' | 'won' | 'lost';

export interface ConquestRun {
  status: RunStatus;
  /** Index into `RUN_STAGES` of the battle being chosen or fought. */
  stage: number;
  /** The current stage's nodes. */
  nodes: ConquestNode[];
  /** The battle being fought (status `battle`). */
  current: ConquestNode | null;
  relics: string[];
  /** Relic options after a win (status `reward`). */
  offer: string[];
  rerollUsed: boolean;
  ascension: number;
  /** Glory earned this run (already added to the meta). */
  glory: number;
  wins: number;
}

export interface ConquestMeta {
  glory: number;
  unlocks: string[];
  /** Highest ascension level that may be picked. */
  ascensionUnlocked: number;
  runsPlayed: number;
  runsWon: number;
}

const RUN_KEY = 'aow-conquest-run';
const META_KEY = 'aow-conquest-meta';

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; progress then lasts until reload.
  }
}

/** In-memory copies, so progress survives even without storage. */
let runCache: ConquestRun | null | undefined;
let metaCache: ConquestMeta | undefined;

export function loadMeta(): ConquestMeta {
  metaCache ??= { glory: 0, unlocks: [], ascensionUnlocked: 0, runsPlayed: 0, runsWon: 0, ...read<ConquestMeta>(META_KEY) };
  return metaCache;
}

function saveMeta(meta: ConquestMeta): void {
  metaCache = meta;
  write(META_KEY, meta);
}

export function loadRun(): ConquestRun | null {
  if (runCache === undefined) runCache = read<ConquestRun>(RUN_KEY);
  return runCache;
}

function saveRun(run: ConquestRun | null): void {
  runCache = run;
  write(RUN_KEY, run);
}

export function hasUnlock(id: string): boolean {
  return loadMeta().unlocks.includes(id);
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function rollNode(stage: number, ascension: number): ConquestNode {
  const spec = RUN_STAGES[stage]!;
  const [lo, hi] = spec.mutators;
  const count = lo + Math.floor(Math.random() * (hi - lo + 1));
  const mutators = shuffled(MUTATORS)
    .slice(0, count)
    .map((m) => m.id);
  const late = Math.random() < spec.lateStart;
  const knownProfiles = CONQUEST_ENEMY_PROFILES.filter((id) => AI_PROFILES.some((p) => p.id === id));
  const trained = AI_PROFILES.filter((p) => p.trainedNote !== undefined).map((p) => p.id);
  const profile = pick([...knownProfiles, ...trained]);
  const glory =
    spec.glory +
    mutators.reduce((sum, id) => sum + (MUTATORS.find((m) => m.id === id)?.glory ?? 0), 0) +
    (late ? LATE_START.glory : 0) +
    ascension;
  return {
    difficulty: pick(spec.difficulties),
    profile,
    mutators,
    startAge: late ? (LATE_START.ageByStage[stage] ?? 1) : 0,
    glory,
  };
}

function rollNodes(stage: number, ascension: number): ConquestNode[] {
  const spec = RUN_STAGES[stage]!;
  return Array.from({ length: spec.choices }, () => rollNode(stage, ascension));
}

function relicPool(owned: readonly string[]): Relic[] {
  return RELICS.filter((r) => !owned.includes(r.id) && (!r.unlock || hasUnlock(r.unlock)));
}

function rollRelics(owned: readonly string[]): string[] {
  const count = RELIC_CHOICES + (hasUnlock('extra-choice') ? 1 : 0);
  return shuffled(relicPool(owned))
    .slice(0, count)
    .map((r) => r.id);
}

/** A new run at `ascension` (clamped to what is unlocked). */
export function startRun(ascension: number): ConquestRun {
  const meta = loadMeta();
  const level = Math.max(0, Math.min(ascension, meta.ascensionUnlocked));
  const relics: string[] = [];
  if (hasUnlock('starting-relic')) {
    const first = pick(relicPool([]));
    relics.push(first.id);
  }
  const run: ConquestRun = {
    status: 'choosing',
    stage: 0,
    nodes: rollNodes(0, level),
    current: null,
    relics,
    offer: [],
    rerollUsed: false,
    ascension: level,
    glory: 0,
    wins: 0,
  };
  saveMeta({ ...meta, runsPlayed: meta.runsPlayed + 1 });
  saveRun(run);
  return run;
}

export function abandonRun(): void {
  saveRun(null);
}

export function chooseNode(index: number): ConquestNode | null {
  const run = loadRun();
  const node = run?.nodes[index];
  if (!run || run.status !== 'choosing' || !node) return null;
  saveRun({ ...run, status: 'battle', current: node });
  return node;
}

/** The result of the battle in progress. */
export function finishBattle(won: boolean): void {
  const run = loadRun();
  if (!run || run.status !== 'battle' || !run.current) return;
  const meta = loadMeta();
  if (!won) {
    saveRun({ ...run, status: 'lost', current: null });
    return;
  }
  let glory = run.current.glory;
  const last = run.stage >= RUN_STAGES.length - 1;
  if (last) {
    glory += GLORY.runBonus;
    saveMeta({
      ...meta,
      glory: meta.glory + glory,
      runsWon: meta.runsWon + 1,
      ascensionUnlocked: Math.min(ASCENSION.maxLevel, Math.max(meta.ascensionUnlocked, run.ascension + 1)),
    });
    saveRun({ ...run, status: 'won', current: null, glory: run.glory + glory, wins: run.wins + 1 });
    return;
  }
  saveMeta({ ...meta, glory: meta.glory + glory });
  saveRun({
    ...run,
    status: 'reward',
    current: null,
    offer: rollRelics(run.relics),
    glory: run.glory + glory,
    wins: run.wins + 1,
  });
}

/** Takes a relic from the offer (or none, with null) and moves to the next stage. */
export function pickRelic(id: string | null): void {
  const run = loadRun();
  if (!run || run.status !== 'reward') return;
  const relics = id && run.offer.includes(id) ? [...run.relics, id] : run.relics;
  const stage = run.stage + 1;
  saveRun({ ...run, status: 'choosing', stage, relics, offer: [], nodes: rollNodes(stage, run.ascension) });
}

/** Rolls the relic offer again, once per run with the unlock. */
export function rerollRelics(): boolean {
  const run = loadRun();
  if (!run || run.status !== 'reward' || run.rerollUsed || !hasUnlock('reroll')) return false;
  saveRun({ ...run, rerollUsed: true, offer: rollRelics(run.relics) });
  return true;
}

/** Buys a Hall of Glory unlock. */
export function buyUnlock(id: string): boolean {
  const meta = loadMeta();
  const unlock = GLORY_UNLOCKS.find((u) => u.id === id);
  if (!unlock || meta.unlocks.includes(id) || meta.glory < unlock.cost) return false;
  saveMeta({ ...meta, glory: meta.glory - unlock.cost, unlocks: [...meta.unlocks, id] });
  return true;
}

/**
 * Everything that shapes a battle, in the order ConquestSystem applies it:
 * start age, then the node's mutators, the run's relics, the Glory unlocks
 * and the ascension level.
 */
export function battleEffects(run: ConquestRun, node: ConquestNode): ConquestEffect[] {
  const effects: ConquestEffect[] = [];
  if (node.startAge > 0) {
    effects.push({ kind: 'start-age', age: node.startAge }, { kind: 'gold', side: 'both', amount: LATE_START.gold });
  }
  for (const id of node.mutators) effects.push(...(MUTATORS.find((m) => m.id === id)?.effects ?? []));
  for (const id of run.relics) effects.push(...(RELICS.find((r) => r.id === id)?.effects ?? []));
  if (hasUnlock('deep-pockets')) effects.push({ kind: 'gold', side: 'player', amount: 100 });
  const a = run.ascension;
  if (a > 0) {
    effects.push(
      { kind: 'unit-stat', side: 'enemy', stat: 'maxHp', mult: 1 + ASCENSION.hpPerLevel * a },
      { kind: 'unit-stat', side: 'enemy', stat: 'damage', mult: 1 + ASCENSION.damagePerLevel * a },
      { kind: 'ai-income', mult: 1 + ASCENSION.incomePerLevel * a },
    );
  }
  return effects;
}

/** Dev and tests: forget all Conquest progress. */
export function resetConquest(): void {
  saveRun(null);
  metaCache = { glory: 0, unlocks: [], ascensionUnlocked: 0, runsPlayed: 0, runsWon: 0 };
  write(META_KEY, null);
}
