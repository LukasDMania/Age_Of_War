import { getAge } from '@config/ages.config';
import {
  ARENA_LANE,
  ARENA_LOSER_BONUS,
  ARENA_START_GOLD,
  ARENA_TIMES,
  ARENA_WAVES,
  ARENA_WINS_NEEDED,
} from '@config/arena.config';
import { GAME_WIDTH } from '@config/constants';
import type { MechDesign } from '@config/mech.config';
import type { Base } from '@entities/Base';
import { isMechUnitId, isUtilityDesign, mechDefinition } from '@entities/mechDesign';
import type { Unit } from '@entities/Unit';
import type { UnitFactory } from '@entities/UnitFactory';
import { getUnitDefinition } from '@entities/unitDefinitions';
import { addGold, trySpendGold } from '@state/economyOps';
import type { MatchState } from '@state/GameState';
import { laneDir, otherSide, SIDES, type ArenaState, type ArenaView, type Side } from '@state/types';
import { dealBaseDamage, retireUnit } from '@systems/damageOps';
import { mechPrice, mechRejection } from '@systems/MechSystem';
import { applyModifier } from '@systems/statusOps';
import { emit, Events, on, type EventPayloads } from '@utils/EventBus';

/** What the arena needs from the scene and the other systems (no references to them). */
export interface ArenaDeps {
  bases: Record<Side, Base>;
  /** Empties a side's training queue (SpawnSystem). */
  clearQueue(side: Side): void;
  /** Draws a Mech's art before it walks out (the scene's art cache). */
  prepareMech(unitId: string, side: Side): void;
}

/** Forge level that opens every Mech part (`traits.mechForgeBonus`): all parts open in the arena. */
const ALL_PARTS_FORGE = 99;
const MID_X = GAME_WIDTH / 2;

/** A fresh arena: round 1's farm starts at once. */
export function createArenaState(age: number): ArenaState {
  return {
    age,
    phase: 'farm',
    round: 1,
    wins: { player: 0, enemy: 0 },
    phaseEndsAt: ARENA_TIMES.farmMs,
    wave: 0,
    nextRaiderAt: ARENA_WAVES.firstAtMs,
    waveQueue: [],
    picks: { player: null, enemy: null },
    paid: { player: 0, enemy: 0 },
    lastLoser: null,
  };
}

/**
 * The Mech Arena (owner, 2026-10-07; GAME_DESIGN 15): best of 3 rounds of
 * farm -> hangar -> fight, on the same lane and rules as a battle.
 *
 * - Farm: raiders (units of the side they attack, marked `raider`) come in
 *   waves from just off the middle; each player's units hold short of the
 *   middle (`holdLine`, used by LaneSystem). A raider that reaches a base
 *   steals its bounty and leaves. At the end turrets are sold back, units
 *   retired and queues cleared.
 * - Hangar: `build-mech-requested` picks (and pays for) the side's Mech;
 *   picking again refunds the old pick. MechSystem leaves these requests to
 *   the arena.
 * - Fight: both Mechs walk out; the last one standing (or the higher HP
 *   share at the time limit) wins the round. Two round wins: the loser's
 *   base falls, which ends the match the usual way.
 *
 * Everything runs inside the simulation (lockstep-safe).
 *
 * Listens for: `build-mech-requested`, `unit-died`.
 * Emits: `arena-changed`, `raider-leaked`, `arena-round-ended`, `unit-spawned`
 * (the Mechs), and `sell-turret-requested` (the farm's turrets, sold back).
 */
export class ArenaSystem {
  private readonly state: MatchState;
  private readonly arena: ArenaState;
  private readonly units: UnitFactory;
  private readonly deps: ArenaDeps;
  private readonly cleanups: (() => void)[];
  private lastAnnounced = '';
  private now = 0;

  constructor(state: MatchState, units: UnitFactory, deps: ArenaDeps) {
    if (!state.arena) throw new Error('ArenaSystem needs MatchState.arena');
    this.state = state;
    this.arena = state.arena;
    this.units = units;
    this.deps = deps;
    for (const side of SIDES) {
      const me = state[side];
      me.traits.mechForgeBonus = ALL_PARTS_FORGE;
      me.mechLocked = [];
    }
    state.mechSides = [...SIDES];
    // Rounds are the Mechs' business: the bases only fall when the match is won.
    for (const side of SIDES) deps.bases[side].invulnerable = true;
    this.cleanups = [
      on(Events.BuildMechRequested, (payload) => this.onPick(payload)),
      on(Events.UnitDied, (payload) => this.onUnitDied(payload)),
    ];
  }

  /** Round 1's farm: starting gold. Call once when the match starts. */
  start(): void {
    this.beginFarm(0);
  }

  /** Each tick, before the AIs and the fighting (`nowMs` is the simulation clock). */
  update(nowMs: number): void {
    this.now = nowMs;
    const a = this.arena;
    switch (a.phase) {
      case 'farm':
        this.spawnRaiders(nowMs);
        this.leaks();
        if (nowMs >= a.phaseEndsAt) this.endFarm(nowMs);
        break;
      case 'hangar':
        if (nowMs >= a.phaseEndsAt || SIDES.every((side) => a.picks[side] !== null)) this.beginFight(nowMs);
        break;
      case 'fight':
        if (nowMs >= a.phaseEndsAt) this.endFightOnTime();
        break;
      case 'round-over':
        if (nowMs >= a.phaseEndsAt) this.beginFarm(nowMs);
        break;
    }
    this.announce(nowMs);
  }

  /**
   * LaneSystem's hold line: while farming, a player's own units stop short of
   * the middle; raiders and everything outside the farm walk freely.
   */
  holdLine(unit: Unit): number | null {
    if (this.arena.phase !== 'farm' || unit.raider) return null;
    return MID_X - laneDir(unit.side) * ARENA_LANE.holdFromMid;
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  /* ---- Farm ----------------------------------------------------------------------------- */

  private beginFarm(nowMs: number): void {
    const a = this.arena;
    if (a.phase === 'round-over') a.round++;
    this.clearLane();
    a.phase = 'farm';
    a.phaseEndsAt = nowMs + ARENA_TIMES.farmMs;
    a.wave = 0;
    a.nextRaiderAt = nowMs + ARENA_WAVES.firstAtMs;
    a.waveQueue = [];
    a.picks = { player: null, enemy: null };
    a.paid = { player: 0, enemy: 0 };
    const scale = getAge(a.age).scale;
    for (const side of SIDES) {
      const bonus = a.lastLoser === side ? ARENA_LOSER_BONUS : 0;
      this.setGold(side, Math.round((ARENA_START_GOLD + bonus) * scale));
      // No special while farming or fighting: it would reach across the middle.
      this.state[side].specialReadyAt = Number.MAX_SAFE_INTEGER;
    }
  }

  private spawnRaiders(nowMs: number): void {
    const a = this.arena;
    if (nowMs < a.nextRaiderAt) return;
    if (a.waveQueue.length === 0) {
      a.waveQueue = this.nextWave();
      a.wave++;
    }
    const unitId = a.waveQueue.shift()!;
    const progress = 1 - Math.max(0, a.phaseEndsAt - nowMs) / ARENA_TIMES.farmMs;
    const strength = 1 + (ARENA_WAVES.maxStrength - 1) * progress;
    // The same raider for both players, each starting on its target's side of the middle.
    for (const side of SIDES) this.spawnRaider(unitId, side, strength);
    a.nextRaiderAt = nowMs + (a.waveQueue.length > 0 ? ARENA_WAVES.spacingMs : ARENA_WAVES.everyMs);
  }

  /** The next wave's raiders: melee, ranged, heavy in turn (heavies later in the farm). */
  private nextWave(): string[] {
    const a = this.arena;
    const ids = getAge(a.age).unitIds;
    const progress = 1 - Math.max(0, a.phaseEndsAt - this.now) / ARENA_TIMES.farmMs;
    const kinds = progress >= ARENA_WAVES.heavyFrom ? [0, 1, 2] : [0, 1];
    const count = 1 + Math.floor(a.wave / ARENA_WAVES.perExtra);
    return Array.from({ length: count }, (_, i) => ids[kinds[(a.wave + i) % kinds.length]!]!);
  }

  /** A raider attacking `victim`: a unit of the other side, just off the middle. */
  private spawnRaider(unitId: string, victim: Side, strength: number): void {
    const side = otherSide(victim);
    const unit = this.units.create(unitId, side);
    // It walks toward `victim`: start on victim's side of the middle, so the
    // two streams walk apart (and only look ahead) instead of through each other.
    unit.x = MID_X - laneDir(victim) * ARENA_LANE.raiderOffset;
    unit.markRaider(ARENA_WAVES.tint);
    if (strength > 1) {
      applyModifier(unit, { id: 'arena-raider-hp', source: 'arena', stat: 'maxHp', mult: strength });
      applyModifier(unit, { id: 'arena-raider-damage', source: 'arena', stat: 'damage', mult: strength });
      unit.hp = unit.getStat('maxHp');
    }
  }

  /** Raiders within reach of the base they walk to steal their bounty and leave. */
  private leaks(): void {
    for (const unit of this.units.activeUnits) {
      if (!unit.raider || !unit.isAlive) continue;
      const victim = otherSide(unit.side);
      const base = this.deps.bases[victim];
      const gap = (base.frontX - unit.x) * laneDir(unit.side) - unit.halfWidth;
      if (gap > (unit.attack?.range ?? 0) + 6) continue;
      const amount = Math.min(this.state[victim].gold, unit.definition.killGold * ARENA_WAVES.bountyMult);
      if (amount > 0) trySpendGold(this.state, victim, amount, 'arena');
      emit(Events.RaiderLeaked, { side: victim, amount, x: unit.x });
      retireUnit(unit);
    }
  }

  private endFarm(nowMs: number): void {
    for (const side of SIDES) {
      // Turrets go back at the normal refund (an investment you get some of back).
      this.state[side].turrets.forEach((turret, slotIndex) => {
        if (turret) emit(Events.SellTurretRequested, { side, slotIndex });
      });
      this.deps.clearQueue(side);
    }
    this.clearLane();
    const a = this.arena;
    a.phase = 'hangar';
    a.phaseEndsAt = nowMs + ARENA_TIMES.hangarMs;
  }

  /* ---- Hangar --------------------------------------------------------------------------- */

  private onPick({ side, design }: EventPayloads[typeof Events.BuildMechRequested]): void {
    const a = this.arena;
    if (a.phase !== 'hangar' || isUtilityDesign(design)) return;
    const before = a.picks[side];
    // A new pick: the old one's price back first, so changing your mind costs nothing.
    if (before) addGold(this.state, side, a.paid[side], 'refund');
    const price = mechPrice(this.state[side], design);
    if (mechRejection(this.state, side, design) === null && trySpendGold(this.state, side, price, 'purchase')) {
      a.picks[side] = { ...design };
      a.paid[side] = price;
    } else if (before) {
      trySpendGold(this.state, side, a.paid[side], 'purchase');
    }
  }

  /* ---- Fight ---------------------------------------------------------------------------- */

  private beginFight(nowMs: number): void {
    const a = this.arena;
    const fielded: Side[] = [];
    for (const side of SIDES) {
      const design = a.picks[side];
      if (design) {
        this.fieldMech(side, design, nowMs);
        fielded.push(side);
      }
    }
    a.phase = 'fight';
    a.phaseEndsAt = nowMs + ARENA_TIMES.fightMaxMs;
    // Nobody built a Mech, or one side didn't: decided on the spot (PROPOSED).
    if (fielded.length < 2) this.endRound(fielded[0] ?? null, nowMs);
  }

  private fieldMech(side: Side, design: MechDesign, nowMs: number): void {
    const definition = mechDefinition(design, this.arena.age);
    this.deps.prepareMech(definition.id, side);
    const unit = this.units.create(definition.id, side);
    const mech = this.state[side].mech;
    mech.alive = true;
    mech.abilityReadyAt = nowMs;
    emit(Events.UnitSpawned, { side, unitId: definition.id, instanceId: unit.instanceId });
  }

  private onUnitDied({ side, unitId, retired, killerSide, instanceId }: EventPayloads[typeof Events.UnitDied]): void {
    // A raider kill pays extra on top of its normal bounty (EconomySystem pays that).
    if (!retired && killerSide && this.units.findByInstanceId(instanceId)?.raider) {
      const extra = getUnitDefinition(unitId).killGold * (ARENA_WAVES.bountyMult - 1);
      if (extra > 0) addGold(this.state, killerSide, extra, 'kill');
      return;
    }
    if (this.arena.phase !== 'fight' || retired || !isMechUnitId(unitId)) return;
    this.endRound(otherSide(side), this.now);
  }

  /** Time's up: the Mech with more of its HP left wins (a tie: nobody). */
  private endFightOnTime(): void {
    const share: Record<Side, number> = { player: 0, enemy: 0 };
    for (const unit of this.units.activeUnits) {
      if (unit.isAlive && isMechUnitId(unit.definition.id)) share[unit.side] = unit.hp / unit.getStat('maxHp');
    }
    const winner = share.player === share.enemy ? null : share.player > share.enemy ? 'player' : 'enemy';
    this.endRound(winner, this.now);
  }

  private endRound(winner: Side | null, nowMs: number): void {
    const a = this.arena;
    if (a.phase === 'round-over') return;
    if (winner) a.wins[winner]++;
    a.lastLoser = winner ? otherSide(winner) : null;
    a.phase = 'round-over';
    a.phaseEndsAt = nowMs + ARENA_TIMES.roundEndMs;
    const matchOver = winner !== null && a.wins[winner] >= ARENA_WINS_NEEDED;
    emit(Events.ArenaRoundEnded, { round: a.round, winner, wins: { ...a.wins }, matchOver });
    if (matchOver) {
      // The match ends the usual way: the loser's base falls.
      const base = this.deps.bases[otherSide(winner)];
      base.invulnerable = false;
      dealBaseDamage(base, base.maxHp * 10);
    }
  }

  /* ---- Helpers -------------------------------------------------------------------------- */

  /** Everything off the lane, unpaid (no bounty, no kill). */
  private clearLane(): void {
    for (const unit of this.units.activeUnits) retireUnit(unit);
  }

  private setGold(side: Side, gold: number): void {
    const now = this.state[side].gold;
    if (now > gold) trySpendGold(this.state, side, now - gold, 'arena');
    else if (now < gold) addGold(this.state, side, gold - now, 'arena');
  }

  /** `arena-changed` on every phase change and once a second. */
  private announce(nowMs: number): void {
    const a = this.arena;
    const remainingMs = Math.max(0, a.phaseEndsAt - nowMs);
    const view: ArenaView = {
      phase: a.phase,
      round: a.round,
      wins: { ...a.wins },
      remainingMs,
      picked: { player: a.picks.player !== null, enemy: a.picks.enemy !== null },
    };
    const key = `${a.phase}|${a.round}|${Math.ceil(remainingMs / 1000)}|${view.picked.player}|${view.picked.enemy}`;
    if (key === this.lastAnnounced) return;
    this.lastAnnounced = key;
    emit(Events.ArenaChanged, view);
  }
}
