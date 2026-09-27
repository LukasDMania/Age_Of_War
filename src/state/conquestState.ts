/**
 * Conquest mode's run and meta state (prototype, feature `conquest`; the
 * campaign rework of 2026-09-27). Plain data kept in localStorage between
 * matches and page loads: the run in progress (`aow-conquest-run`) and what
 * carries over between runs (`aow-conquest-meta`: Glory, Legacy unlocks,
 * Ascension, lifetime stats for achievements). Nothing here touches a match;
 * `systems/experimental/ConquestSystem.ts` applies a battle's effects.
 *
 * The flow: `startRun` (commander, ascension) rolls chapter 1's map;
 * `chooseNode` picks a node on the path; battles return through
 * `finishBattle`; camps, events and treasure resolve on the campaign screen;
 * `continueRun` moves to the next column, and after a boss to the next
 * chapter (the next age). Five chapters make a run; banners are its lives.
 */
import { AI_PROFILES, findAiProfile } from '@config/aiGenome.config';
import { AGE_NAMES } from '@config/ages.config';
import type { AiDifficultyName } from '@config/ai.config';
import {
  ACHIEVEMENTS,
  ASCENSION,
  BANNERS,
  BASE_BONUS_SUPPLIES,
  BATTLE_ECONOMY,
  BOSSES,
  CAMP_REST_COST,
  CAMP_UPGRADES,
  CHAPTERS,
  COLUMN_WEIGHTS,
  COMMANDERS,
  CONQUEST_ENEMY_PROFILES,
  EVENTS,
  GLORY,
  LEGACY,
  LEGACY_TIER_REQUIRES,
  MAP_COLUMNS,
  MAP_ROWS,
  MUTATORS,
  NODE_INFO,
  NODE_REWARDS,
  RELIC_CHOICES,
  RELICS,
  type Commander,
  type ConquestEffect,
  type ConquestEvent,
  type ConquestStats,
  type EventOutcome,
  type NodeType,
  type Relic,
  type RunPerks,
} from '@config/conquest.config';

/* ---- Shapes ------------------------------------------------------------------------------ */

/** Who a battle node is against. */
export interface BattleSpec {
  difficulty: AiDifficultyName;
  profile: string;
  mutators: string[];
  /** Index into BOSSES for a boss. */
  boss?: number;
}

export interface MapNode {
  type: NodeType;
  col: number;
  row: number;
  battle?: BattleSpec;
  eventId?: string;
}

export type RunStatus = 'map' | 'battle' | 'result' | 'camp' | 'event' | 'treasure' | 'won' | 'lost';

export interface BattleResult {
  won: boolean;
  supplies: number;
  glory: number;
  /** A banner lost (loss) or won back (boss). */
  banners: number;
}

export interface ConquestRun {
  version: 2;
  status: RunStatus;
  commander: string;
  ascension: number;
  /** 0..4, the age of the chapter's battles. */
  chapter: number;
  /** columns[col][row]; the boss comes after the last column. */
  columns: MapNode[][];
  boss: MapNode;
  /** Next column to choose from (MAP_COLUMNS: the boss). */
  step: number;
  /** Row picked in each column so far this chapter. */
  path: number[];
  /** The node being resolved. */
  current: MapNode | null;
  banners: number;
  maxBanners: number;
  supplies: number;
  relics: string[];
  /** Relic options waiting to be picked (after an elite, a boss, a treasure). */
  offer: string[];
  rerolls: number;
  /** Camp upgrade levels bought this run. */
  upgrades: Record<string, number>;
  /** Event effects for every battle of the run, and for the next battle only. */
  runEffects: ConquestEffect[];
  nextBattle: ConquestEffect[];
  glory: number;
  wins: number;
  lastResult: BattleResult | null;
  /** The text of the event option just picked (status `event`). */
  eventOutcome: string | null;
}

export interface ConquestMeta {
  version: 2;
  glory: number;
  unlocks: string[];
  /** Highest ascension level that may be picked. */
  ascensionUnlocked: number;
  runsPlayed: number;
  stats: ConquestStats;
}

/* ---- Storage -------------------------------------------------------------------------------- */

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

const emptyStats = (): ConquestStats => ({
  battlesWon: 0,
  elitesWon: 0,
  bossesWon: 0,
  maxChapter: 0,
  runsWon: 0,
  runsLost: 0,
  maxRelics: 0,
  eventsSeen: 0,
});

/** In-memory copies, so progress survives even without storage. */
let runCache: ConquestRun | null | undefined;
let metaCache: ConquestMeta | undefined;

export function loadMeta(): ConquestMeta {
  if (metaCache) return metaCache;
  // Version 1 (the five-battle prototype) kept glory, unlocks and ascension at the top level.
  const stored = read<Partial<ConquestMeta> & { runsWon?: number }>(META_KEY);
  metaCache = {
    version: 2,
    glory: stored?.glory ?? 0,
    unlocks: (stored?.unlocks ?? []).filter((id) => LEGACY.some((l) => l.id === id)),
    ascensionUnlocked: stored?.ascensionUnlocked ?? 0,
    runsPlayed: stored?.runsPlayed ?? 0,
    stats: { ...emptyStats(), ...(stored?.stats ?? {}), ...(stored?.version === 2 ? {} : { runsWon: stored?.runsWon ?? 0 }) },
  };
  return metaCache;
}

function saveMeta(meta: ConquestMeta): void {
  metaCache = meta;
  write(META_KEY, meta);
}

export function loadRun(): ConquestRun | null {
  if (runCache === undefined) {
    const stored = read<ConquestRun>(RUN_KEY);
    // Runs from the five-battle prototype can't continue in the campaign.
    runCache = stored?.version === 2 ? stored : null;
  }
  return runCache;
}

function saveRun(run: ConquestRun | null): void {
  runCache = run;
  write(RUN_KEY, run);
}

/* ---- Meta helpers ---------------------------------------------------------------------------- */

export function hasUnlock(id: string): boolean {
  return loadMeta().unlocks.includes(id);
}

/** The run-wide knobs of every Legacy unlock owned, added up. */
export function runPerks(): Required<RunPerks> {
  const sum: Required<RunPerks> = {
    banners: 0,
    supplies: 0,
    suppliesBonus: 0,
    relicChoices: 0,
    rerolls: 0,
    startingRelic: false,
    campDiscount: 0,
    gloryBonus: 0,
  };
  for (const id of loadMeta().unlocks) {
    const run = LEGACY.find((l) => l.id === id)?.run;
    if (!run) continue;
    sum.banners += run.banners ?? 0;
    sum.supplies += run.supplies ?? 0;
    sum.suppliesBonus += run.suppliesBonus ?? 0;
    sum.relicChoices += run.relicChoices ?? 0;
    sum.rerolls += run.rerolls ?? 0;
    sum.startingRelic ||= run.startingRelic ?? false;
    sum.campDiscount += run.campDiscount ?? 0;
    sum.gloryBonus += run.gloryBonus ?? 0;
  }
  return sum;
}

export function achievementDone(id: string): boolean {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  return a ? loadMeta().stats[a.stat] >= a.atLeast : false;
}

export function commanderUnlocked(commander: Commander): boolean {
  return !commander.unlock || achievementDone(commander.unlock);
}

/** Whether a Legacy tier is open (enough unlocks bought). */
export function legacyTierOpen(tier: 1 | 2 | 3 | 4): boolean {
  return loadMeta().unlocks.length >= LEGACY_TIER_REQUIRES[tier];
}

export function buyUnlock(id: string): boolean {
  const meta = loadMeta();
  const unlock = LEGACY.find((u) => u.id === id);
  if (!unlock || meta.unlocks.includes(id) || meta.glory < unlock.cost || !legacyTierOpen(unlock.tier)) return false;
  saveMeta({ ...meta, glory: meta.glory - unlock.cost, unlocks: [...meta.unlocks, id] });
  return true;
}

function bumpStats(change: (stats: ConquestStats) => Partial<ConquestStats>, glory = 0, extra: Partial<ConquestMeta> = {}): void {
  const meta = loadMeta();
  saveMeta({ ...meta, ...extra, glory: meta.glory + glory, stats: { ...meta.stats, ...change(meta.stats) } });
}

/* ---- Rolling -------------------------------------------------------------------------------- */

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function weighted<K extends string>(weights: Readonly<Partial<Record<K, number>>>): K {
  const entries = Object.entries(weights) as [K, number][];
  let roll = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[0]![0];
}

function enemyProfile(chapter: number): string {
  const known = CONQUEST_ENEMY_PROFILES.filter((id) => AI_PROFILES.some((p) => p.id === id));
  // Trained AIs are the strongest; they join from chapter 3.
  const trained = chapter >= 2 ? AI_PROFILES.filter((p) => p.trainedNote !== undefined).map((p) => p.id) : [];
  return pick([...known, ...trained]);
}

function rollMutators(range: readonly [number, number], exclude: readonly string[] = []): string[] {
  const [lo, hi] = range;
  const count = lo + Math.floor(Math.random() * (hi - lo + 1));
  return shuffled(MUTATORS.filter((m) => !exclude.includes(m.id)))
    .slice(0, count)
    .map((m) => m.id);
}

function rollChapter(chapter: number): { columns: MapNode[][]; boss: MapNode } {
  const spec = CHAPTERS[chapter]!;
  const events = shuffled(EVENTS.map((e) => e.id));
  const columns: MapNode[][] = [];
  for (let col = 0; col < MAP_COLUMNS; col++) {
    const nodes: MapNode[] = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      const type = weighted<NodeType>(COLUMN_WEIGHTS[col] ?? { battle: 1 });
      const node: MapNode = { type, col, row };
      if (type === 'battle') {
        node.battle = { difficulty: pick(spec.battle.difficulties), profile: enemyProfile(chapter), mutators: rollMutators(spec.battle.mutators) };
      } else if (type === 'elite') {
        node.battle = { difficulty: spec.elite.difficulty, profile: enemyProfile(chapter + 1), mutators: rollMutators(spec.elite.mutators) };
      } else if (type === 'event') {
        node.eventId = events.pop() ?? pick(EVENTS).id;
      }
      nodes.push(node);
    }
    // Every column offers at least one fight.
    if (!nodes.some((n) => n.type === 'battle' || n.type === 'elite')) {
      const n = nodes[Math.floor(Math.random() * nodes.length)]!;
      n.type = 'battle';
      delete n.eventId;
      n.battle = { difficulty: pick(spec.battle.difficulties), profile: enemyProfile(chapter), mutators: rollMutators(spec.battle.mutators) };
    }
    columns.push(nodes);
  }
  const bossSpec = BOSSES[chapter]!;
  const boss: MapNode = {
    type: 'boss',
    col: MAP_COLUMNS,
    row: 1,
    battle: { difficulty: 'hard', profile: bossSpec.profile, mutators: [...bossSpec.mutators], boss: chapter },
  };
  return { columns, boss };
}

function relicPool(owned: readonly string[], rare: boolean): Relic[] {
  return RELICS.filter((r) => !owned.includes(r.id) && (!r.unlock || hasUnlock(r.unlock)) && (rare || !r.rare));
}

function rollRelics(owned: readonly string[], rare = true): string[] {
  const count = RELIC_CHOICES + runPerks().relicChoices;
  return shuffled(relicPool(owned, rare))
    .slice(0, count)
    .map((r) => r.id);
}

/* ---- Run flow ------------------------------------------------------------------------------ */

export function startRun(commanderId: string, ascension: number): ConquestRun {
  const meta = loadMeta();
  const perks = runPerks();
  const commander = COMMANDERS.find((c) => c.id === commanderId && commanderUnlocked(c)) ?? COMMANDERS[0]!;
  const level = Math.max(0, Math.min(ascension, meta.ascensionUnlocked));
  const relics: string[] = [];
  if (perks.startingRelic) relics.push(pick(relicPool([], false)).id);
  const maxBanners = BANNERS.max + perks.banners + (commander.banners ?? 0);
  const { columns, boss } = rollChapter(0);
  const run: ConquestRun = {
    version: 2,
    status: 'map',
    commander: commander.id,
    ascension: level,
    chapter: 0,
    columns,
    boss,
    step: 0,
    path: [],
    current: null,
    banners: Math.min(maxBanners, BANNERS.start + perks.banners + (commander.banners ?? 0)),
    maxBanners,
    supplies: perks.supplies,
    relics,
    offer: [],
    rerolls: perks.rerolls,
    upgrades: {},
    runEffects: [],
    nextBattle: [],
    glory: 0,
    wins: 0,
    lastResult: null,
    eventOutcome: null,
  };
  bumpStats((s) => ({ maxChapter: Math.max(s.maxChapter, 1) }), 0, { runsPlayed: meta.runsPlayed + 1 });
  saveRun(run);
  return run;
}

export function abandonRun(): void {
  saveRun(null);
}

/** Rows that can be picked in the run's current column. */
export function reachableRows(run: ConquestRun): number[] {
  if (run.step >= MAP_COLUMNS) return [];
  const last = run.path[run.step - 1];
  const rows = Array.from({ length: MAP_ROWS }, (_, r) => r);
  return last === undefined ? rows : rows.filter((r) => Math.abs(r - last) <= 1);
}

/** The node in the current column at `row`, or the boss once the columns are done. */
export function chooseNode(row: number): MapNode | null {
  const run = loadRun();
  if (!run || run.status !== 'map') return null;
  const node = run.step >= MAP_COLUMNS ? run.boss : reachableRows(run).includes(row) ? run.columns[run.step]?.[row] : undefined;
  if (!node) return null;
  const status: RunStatus =
    node.type === 'camp' ? 'camp' : node.type === 'event' ? 'event' : node.type === 'treasure' ? 'treasure' : 'battle';
  const offer = node.type === 'treasure' ? rollRelics(run.relics) : [];
  const path = run.step >= MAP_COLUMNS ? run.path : [...run.path, row];
  if (node.type === 'event') bumpStats((s) => ({ eventsSeen: s.eventsSeen + 1 }));
  saveRun({ ...run, status, current: node, offer, path, eventOutcome: null, lastResult: null });
  return node;
}

/** Everything that shapes the current battle, for GameScene. */
export interface BattleSetup {
  difficulty: AiDifficultyName;
  profile: string;
  /** The chapter's age: battles start in it and can't age past it. */
  age: number;
  effects: ConquestEffect[];
  label: string;
}

export function battleSetup(run: ConquestRun): BattleSetup | null {
  const node = run.current;
  const battle = node?.battle;
  if (!node || !battle) return null;
  const chapter = CHAPTERS[run.chapter]!;
  const effects: ConquestEffect[] = [];
  if (chapter.age > 0) effects.push({ kind: 'start-age', age: chapter.age });
  effects.push({ kind: 'gold', side: 'both', amount: chapter.startGold });
  effects.push({ kind: 'ai-income', mult: BATTLE_ECONOMY.aiIncome }, { kind: 'kill-gold', side: 'player', mult: BATTLE_ECONOMY.playerKillGold });
  for (const id of battle.mutators) effects.push(...(MUTATORS.find((m) => m.id === id)?.effects ?? []));
  if (battle.boss !== undefined) effects.push(...(BOSSES[battle.boss]?.effects ?? []));
  effects.push(...(COMMANDERS.find((c) => c.id === run.commander)?.effects ?? []));
  for (const id of run.relics) effects.push(...(RELICS.find((r) => r.id === id)?.effects ?? []));
  for (const upgrade of CAMP_UPGRADES) {
    for (let i = 0; i < (run.upgrades[upgrade.id] ?? 0); i++) effects.push(...upgrade.effects);
  }
  effects.push(...run.runEffects, ...run.nextBattle);
  for (const id of loadMeta().unlocks) effects.push(...(LEGACY.find((l) => l.id === id)?.battle ?? []));
  const a = run.ascension;
  if (a > 0) {
    effects.push(
      { kind: 'unit-stat', side: 'enemy', stat: 'maxHp', mult: 1 + ASCENSION.hpPerLevel * a },
      { kind: 'unit-stat', side: 'enemy', stat: 'damage', mult: 1 + ASCENSION.damagePerLevel * a },
      { kind: 'ai-income', mult: 1 + ASCENSION.incomePerLevel * a },
    );
  }
  const who =
    battle.boss !== undefined
      ? `${BOSSES[battle.boss]!.name}`
      : `${findAiProfile(battle.profile)?.label ?? battle.profile} · ${NODE_INFO[node.type].name}`;
  return {
    difficulty: battle.difficulty,
    profile: battle.profile,
    age: chapter.age,
    effects,
    label: `${who} · ${AGE_NAMES[chapter.age]} ${run.chapter + 1}/5`,
  };
}

/** The result of the battle in progress; `baseShare` is how much of the player's base is left (0-1). */
export function finishBattle(won: boolean, baseShare = 0): void {
  const run = loadRun();
  const node = run?.current;
  if (!run || run.status !== 'battle' || !node?.battle) return;
  const type = node.type as 'battle' | 'elite' | 'boss';
  if (!won) {
    const banners = run.banners - 1;
    const result: BattleResult = { won: false, supplies: 0, glory: 0, banners: -1 };
    if (banners <= 0) {
      bumpStats((s) => ({ runsLost: s.runsLost + 1 }));
      saveRun({ ...run, status: 'lost', banners: 0, nextBattle: [], lastResult: result });
      return;
    }
    saveRun({ ...run, status: 'result', banners, nextBattle: [], lastResult: result });
    return;
  }
  const perks = runPerks();
  const commander = COMMANDERS.find((c) => c.id === run.commander);
  const reward = NODE_REWARDS[type](run.chapter);
  const supplies = Math.round(
    (reward.supplies + BASE_BONUS_SUPPLIES * Math.max(0, Math.min(1, baseShare))) * (commander?.suppliesMult ?? 1) * (1 + perks.suppliesBonus),
  );
  const mutatorGlory = node.battle.mutators.reduce((s, id) => s + (MUTATORS.find((m) => m.id === id)?.glory ?? 0), 0);
  const glory = Math.round((reward.glory + mutatorGlory + run.ascension) * (1 + perks.gloryBonus));
  const bannerBack = type === 'boss' && run.banners < run.maxBanners ? 1 : 0;
  bumpStats(
    (s) => ({
      battlesWon: s.battlesWon + 1,
      elitesWon: s.elitesWon + (type === 'elite' ? 1 : 0),
      bossesWon: s.bossesWon + (type === 'boss' ? 1 : 0),
    }),
    glory,
  );
  saveRun({
    ...run,
    status: 'result',
    supplies: run.supplies + supplies,
    banners: run.banners + bannerBack,
    glory: run.glory + glory,
    wins: run.wins + 1,
    nextBattle: [],
    offer: type === 'elite' || type === 'boss' ? rollRelics(run.relics) : [],
    lastResult: { won: true, supplies, glory, banners: bannerBack },
  });
}

/** Takes a relic from the offer (null: none). */
export function takeRelic(id: string | null): void {
  const run = loadRun();
  if (!run || run.offer.length === 0) return;
  const relics = id && run.offer.includes(id) ? [...run.relics, id] : run.relics;
  bumpStats((s) => ({ maxRelics: Math.max(s.maxRelics, relics.length) }));
  saveRun({ ...run, relics, offer: [] });
}

export function rerollRelics(): boolean {
  const run = loadRun();
  if (!run || run.offer.length === 0 || run.rerolls <= 0) return false;
  saveRun({ ...run, rerolls: run.rerolls - 1, offer: rollRelics(run.relics) });
  return true;
}

/**
 * Leaves the resolved node: the next column, or after the boss the next
 * chapter (the next age), or the end of the run. A lost boss is fought
 * again: the path stays where it is.
 */
export function continueRun(): void {
  const run = loadRun();
  if (!run || !run.current || !['result', 'camp', 'event', 'treasure'].includes(run.status) || run.offer.length > 0) return;
  const node = run.current;
  const lostBoss = node.type === 'boss' && run.lastResult?.won === false;
  if (lostBoss) {
    saveRun({ ...run, status: 'map', current: null, lastResult: null });
    return;
  }
  if (node.type !== 'boss') {
    saveRun({ ...run, status: 'map', current: null, step: run.step + 1, eventOutcome: null });
    return;
  }
  const chapter = run.chapter + 1;
  if (chapter >= CHAPTERS.length) {
    const meta = loadMeta();
    const glory = Math.round(GLORY.runBonus * (1 + runPerks().gloryBonus));
    bumpStats((s) => ({ runsWon: s.runsWon + 1 }), glory, {
      ascensionUnlocked: Math.min(ASCENSION.maxLevel, Math.max(meta.ascensionUnlocked, run.ascension + 1)),
    });
    saveRun({ ...run, status: 'won', current: null, glory: run.glory + glory });
    return;
  }
  const { columns, boss } = rollChapter(chapter);
  bumpStats((s) => ({ maxChapter: Math.max(s.maxChapter, chapter + 1) }), GLORY.perChapter);
  saveRun({ ...run, status: 'map', chapter, columns, boss, step: 0, path: [], current: null, glory: run.glory + GLORY.perChapter });
}

/* ---- Camps -------------------------------------------------------------------------------- */

export function campUpgradeCost(run: ConquestRun, id: string): number | null {
  const upgrade = CAMP_UPGRADES.find((u) => u.id === id);
  const level = run.upgrades[id] ?? 0;
  if (!upgrade || level >= upgrade.maxLevel) return null;
  return Math.round((upgrade.cost.base + upgrade.cost.step * level) * (1 - runPerks().campDiscount));
}

export function buyCampUpgrade(id: string): boolean {
  const run = loadRun();
  if (!run || run.status !== 'camp') return false;
  const cost = campUpgradeCost(run, id);
  if (cost === null || run.supplies < cost) return false;
  saveRun({ ...run, supplies: run.supplies - cost, upgrades: { ...run.upgrades, [id]: (run.upgrades[id] ?? 0) + 1 } });
  return true;
}

export function restAtCamp(): boolean {
  const run = loadRun();
  if (!run || run.status !== 'camp' || run.supplies < CAMP_REST_COST || run.banners >= run.maxBanners) return false;
  saveRun({ ...run, supplies: run.supplies - CAMP_REST_COST, banners: run.banners + 1 });
  return true;
}

/* ---- Events ------------------------------------------------------------------------------- */

export function currentEvent(run: ConquestRun): ConquestEvent | null {
  return EVENTS.find((e) => e.id === run.current?.eventId) ?? null;
}

/** Picks an event option; returns false if it can't be afforded or was already picked. */
export function chooseEventOption(index: number): boolean {
  const run = loadRun();
  const event = run ? currentEvent(run) : null;
  const option = event?.options[index];
  if (!run || run.status !== 'event' || !option || run.eventOutcome !== null) return false;
  const cost = option.cost ?? 0;
  if (run.supplies < cost) return false;
  const outcome: EventOutcome = option.chance === undefined || Math.random() < option.chance ? option.win : (option.lose ?? option.win);
  let next: ConquestRun = { ...run, supplies: run.supplies - cost, eventOutcome: outcome.text };
  if (outcome.supplies) next.supplies = Math.max(0, next.supplies + outcome.supplies);
  if (outcome.banners) next.banners = Math.min(next.maxBanners, next.banners + outcome.banners);
  if (outcome.nextBattle) next.nextBattle = [...next.nextBattle, ...outcome.nextBattle];
  if (outcome.runEffects) next.runEffects = [...next.runEffects, ...outcome.runEffects];
  if (outcome.relic) {
    const relic = relicPool(next.relics, false);
    if (relic.length > 0) next = { ...next, relics: [...next.relics, pick(relic).id] };
  }
  if (outcome.glory) {
    bumpStats(() => ({}), outcome.glory);
    next.glory += outcome.glory;
  }
  if (next.banners <= 0) {
    bumpStats((s) => ({ runsLost: s.runsLost + 1 }));
    next = { ...next, banners: 0, status: 'lost' };
  }
  bumpStats((s) => ({ maxRelics: Math.max(s.maxRelics, next.relics.length) }));
  saveRun(next);
  return true;
}

/* ---- Dev ------------------------------------------------------------------------------------ */

/** Dev and tests: forget all Conquest progress. */
export function resetConquest(): void {
  saveRun(null);
  metaCache = { version: 2, glory: 0, unlocks: [], ascensionUnlocked: 0, runsPlayed: 0, stats: emptyStats() };
  write(META_KEY, null);
}

/** Dev: overwrite parts of the meta (for screenshots and tests). */
export function patchMeta(patch: Partial<ConquestMeta>): void {
  saveMeta({ ...loadMeta(), ...patch });
}
