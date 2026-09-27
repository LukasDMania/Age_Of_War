import type { AiDifficultyName } from '@config/ai.config';
import { BUILDINGS, RESEARCH } from '@config/buildings.config';
import type { ConquestEffect } from '@config/conquest.config';
import type { UnitFactory } from '@entities/UnitFactory';
import type { MatchState, SideState } from '@state/GameState';
import type { Side } from '@state/types';
import { mineGoldPerSec, libraryXpPerSec } from '@systems/BuildingSystem';
import { Events, on, type GoldSource } from '@utils/EventBus';

/** Bump when the log shape changes. 2: `conquest`. */
const LOG_VERSION = 2;
/** Sim time between state snapshots. */
const SNAPSHOT_EVERY_MS = 15000;
/** Where the dev server saves logs (see the `playtest-logs` plugin in vite.config.ts). */
const LOG_ENDPOINT = '/__playtest-log';

export type MatchResult = 'won' | 'lost' | 'quit' | 'restarted' | 'closed';

interface SideSnapshot {
  gold: number;
  xp: number;
  age: number;
  baseHp: number;
  /** Living units per slot 1..5. */
  units: [number, number, number, number, number];
  /** Summed cost of living units. */
  armyValue: number;
  queue: number;
  turrets: string[];
  buildings: string;
  researchTiers: number;
  mineGoldPerSec: number;
  libraryXpPerSec: number;
}

interface LoggedEvent {
  /** Sim seconds since the match started. */
  t: number;
  side?: Side;
  type: string;
  detail?: string | number;
}

interface SideTotals {
  goldEarned: Partial<Record<GoldSource, number>>;
  goldSpent: number;
  /** Units that entered the lane, by unit id. */
  spawned: Record<string, number>;
  /** Enemy units this side killed, by unit id. */
  kills: Record<string, number>;
  /** Own units lost, by unit id. */
  losses: Record<string, number>;
}

export interface MatchLog {
  version: number;
  startedAt: string;
  fileStem: string;
  opponent: AiDifficultyName | 'off';
  result: MatchResult | null;
  durationSec: number;
  totals: Record<Side, SideTotals>;
  events: LoggedEvent[];
  snapshots: { t: number; front: { player: number | null; enemy: number | null }; player: SideSnapshot; enemy: SideSnapshot }[];
  /** The tunables in force, so logs from different balance versions can be told apart. */
  config: { buildings: unknown; research: unknown };
  /** A Conquest battle's label and effects (mutators, relics, upgrades...); null in a normal match. */
  conquest: { label: string; effects: readonly ConquestEffect[] } | null;
}

function emptyTotals(): SideTotals {
  return { goldEarned: {}, goldSpent: 0, spawned: {}, kills: {}, losses: {} };
}

function bump(map: Record<string, number>, key: string, by = 1): void {
  map[key] = (map[key] ?? 0) + by;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Records a human-played match for balance work (dev builds only): what each
 * side bought and built and when, gold earned by source, kills and losses,
 * a snapshot of both sides every 15 s of game time, and a Conquest battle's
 * setup (file names say `conquest-vs-...`). When the match ends
 * (win, loss, restart, quit to menu or closing the tab) the log is posted to
 * the dev server, which writes it to `playtest-logs/` in the project.
 *
 * Only listens; never changes game state.
 *
 * Listens for: `gold-changed`, `unit-spawned`, `unit-died`, `turret-built`,
 * `turret-upgraded`, `turret-sold`, `slot-unlocked`, `building-upgraded`,
 * `research-completed`, `age-changed`, `special-fired`, `base-damaged`,
 * `game-speed-changed`, `match-state-changed`.
 */
export class MatchLogger {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly now: () => number;
  private readonly log: MatchLog;
  private readonly cleanups: (() => void)[];
  private nextSnapshotAt = 0;
  private finished = false;
  /** Base HP thresholds already logged, per side. */
  private readonly baseMarks: Record<Side, Set<number>> = { player: new Set(), enemy: new Set() };
  private readonly onUnload = (): void => this.finish('closed');

  constructor(
    state: MatchState,
    units: UnitFactory,
    opponent: AiDifficultyName | 'off',
    now: () => number,
    conquest: MatchLog['conquest'] = null,
  ) {
    this.state = state;
    this.units = units;
    this.now = now;
    const d = new Date();
    this.log = {
      version: LOG_VERSION,
      startedAt: d.toISOString(),
      fileStem: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}_${conquest ? 'conquest-' : ''}vs-${opponent}`,
      opponent,
      result: null,
      durationSec: 0,
      totals: { player: emptyTotals(), enemy: emptyTotals() },
      events: [],
      snapshots: [],
      config: { buildings: BUILDINGS, research: RESEARCH },
      conquest,
    };
    const add = (type: string, side?: Side, detail?: string | number): void => {
      const entry: LoggedEvent = { t: this.seconds(), type };
      if (side) entry.side = side;
      if (detail !== undefined) entry.detail = detail;
      this.log.events.push(entry);
    };
    this.cleanups = [
      on(Events.GoldChanged, ({ side, delta, source }) => {
        const totals = this.log.totals[side];
        if (delta > 0) totals.goldEarned[source] = (totals.goldEarned[source] ?? 0) + delta;
        else totals.goldSpent -= delta;
      }),
      on(Events.UnitSpawned, ({ side, unitId }) => {
        bump(this.log.totals[side].spawned, unitId);
        add('unit', side, unitId);
      }),
      on(Events.UnitDied, ({ side, unitId, killerSide }) => {
        bump(this.log.totals[side].losses, unitId);
        bump(this.log.totals[killerSide].kills, unitId);
      }),
      on(Events.TurretBuilt, ({ side, slotIndex, turretId }) => add('turret-built', side, `${slotIndex}:${turretId}`)),
      on(Events.TurretUpgraded, ({ side, slotIndex, level }) => add('turret-upgraded', side, `${slotIndex}:L${level}`)),
      on(Events.TurretSold, ({ side, slotIndex, refund }) => add('turret-sold', side, `${slotIndex}:+${refund}`)),
      on(Events.SlotUnlocked, ({ side, slotIndex }) => add('slot-unlocked', side, slotIndex)),
      on(Events.BuildingUpgraded, ({ side, buildingId, level }) => add('building', side, `${buildingId}:L${level}`)),
      on(Events.ResearchCompleted, ({ side, researchId, tier }) => add('research', side, `${researchId}:T${tier}`)),
      on(Events.AgeChanged, ({ side, age }) => add('age-up', side, age)),
      on(Events.SpecialFired, ({ side }) => add('special', side)),
      on(Events.BaseDamaged, ({ side, hp, maxHp }) => {
        for (const mark of [75, 50, 25]) {
          if (hp / maxHp <= mark / 100 && !this.baseMarks[side].has(mark)) {
            this.baseMarks[side].add(mark);
            add('base-below', side, mark);
          }
        }
      }),
      on(Events.GameSpeedChanged, ({ multiplier }) => add('speed', undefined, multiplier)),
      on(Events.MatchStateChanged, ({ to }) => {
        if (to === 'paused' || to === 'playing') add(to);
      }),
    ];
    window.addEventListener('beforeunload', this.onUnload);
  }

  /** Call every simulation tick with the sim clock. */
  update(nowMs: number): void {
    if (this.finished || nowMs < this.nextSnapshotAt) return;
    this.nextSnapshotAt = nowMs + SNAPSHOT_EVERY_MS;
    this.snapshot();
  }

  /** Ends the log and sends it. Only the first call counts. */
  finish(result: MatchResult): void {
    if (this.finished) return;
    this.finished = true;
    this.snapshot();
    this.log.result = result;
    this.log.durationSec = this.seconds();
    this.log.fileStem += `_${result}`;
    const body = JSON.stringify(this.log);
    if (result === 'closed') {
      navigator.sendBeacon(LOG_ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(LOG_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .then((res) => res.text())
      .then((name) => console.info(`[playtest] match log saved: playtest-logs/${name}`))
      .catch((err: unknown) => console.warn('[playtest] could not save the match log', err));
  }

  destroy(): void {
    window.removeEventListener('beforeunload', this.onUnload);
    for (const off of this.cleanups) off();
  }

  private seconds(): number {
    return Math.round(this.now() / 100) / 10;
  }

  private snapshot(): void {
    const front: { player: number | null; enemy: number | null } = { player: null, enemy: null };
    const counts: Record<Side, [number, number, number, number, number]> = {
      player: [0, 0, 0, 0, 0],
      enemy: [0, 0, 0, 0, 0],
    };
    const value: Record<Side, number> = { player: 0, enemy: 0 };
    for (const unit of this.units.activeUnits) {
      if (!unit.isAlive) continue;
      counts[unit.side][unit.definition.slot - 1]++;
      value[unit.side] += unit.definition.cost;
      if (unit.definition.role !== 'combat') continue;
      const x = Math.round(unit.x);
      if (unit.side === 'player') front.player = Math.max(front.player ?? -Infinity, x);
      else front.enemy = Math.min(front.enemy ?? Infinity, x);
    }
    const side = (s: Side): SideSnapshot => this.sideSnapshot(this.state[s], counts[s], value[s]);
    this.log.snapshots.push({ t: this.seconds(), front, player: side('player'), enemy: side('enemy') });
  }

  private sideSnapshot(s: SideState, units: SideSnapshot['units'], armyValue: number): SideSnapshot {
    return {
      gold: Math.floor(s.gold),
      xp: Math.floor(s.xp),
      age: s.age,
      baseHp: Math.ceil(s.baseHp),
      units,
      armyValue,
      queue: s.trainingQueue.length,
      turrets: s.turrets.filter((t) => t !== null).map((t) => `${t.turretId}:L${t.level}`),
      buildings: `mine${s.buildings.mine} lib${s.buildings.library} forge${s.buildings.forge}`,
      researchTiers: Object.values(s.research).reduce((sum, tier) => sum + tier, 0),
      mineGoldPerSec: Math.round(mineGoldPerSec(s) * 10) / 10,
      libraryXpPerSec: Math.round(libraryXpPerSec(s) * 10) / 10,
    };
  }
}

