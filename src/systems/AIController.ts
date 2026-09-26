import { AI_RICH_GOLD_MULT, AI_THREAT_DISTANCE, AI_UNIT_MIX, type AiDifficulty } from '@config/ai.config';
import { getAge } from '@config/ages.config';
import {
  buildingUpgradeCost,
  RESEARCH,
  researchCost,
  type BuildingId,
  type ResearchId,
} from '@config/buildings.config';
import { MAX_TURRET_SLOTS, UNIT_QUEUE_LIMIT } from '@config/constants';
import type { Base } from '@entities/Base';
import {
  getTurretDefinition,
  slotUnlockCost,
  turretSellRefund,
  type TurretKind,
} from '@entities/turretDefinitions';
import type { UnitFactory } from '@entities/UnitFactory';
import { getUnitDefinition } from '@entities/unitDefinitions';
import type { MatchState, SideState } from '@state/GameState';
import type { Side } from '@state/types';
import { buildingRejection, researchRejection } from '@systems/BuildingSystem';
import { emit, Events } from '@utils/EventBus';

/** What the AI sees of the lane when it thinks. */
interface LaneView {
  /** Living enemy (player) units by slot 1-5, and their total price. */
  theirs: Record<1 | 2 | 3 | 4 | 5, number>;
  theirValue: number;
  theirCount: number;
  /** Own living units by slot, plus own queued units, and their total price. */
  mine: Record<1 | 2 | 3 | 4 | 5, number>;
  myValue: number;
  myCombat: number;
  /** An enemy unit is close to our base. */
  threat: boolean;
}

/** Turret kinds in the order the AI fills its slots. */
const TURRET_ORDER: readonly TurretKind[] = ['rapid', 'area', 'heavy'];

/** Buildings in the order the AI prefers them when levels tie (Phase 14). */
const BUILDING_ORDER: readonly BuildingId[] = ['mine', 'forge', 'library'];

/**
 * The enemy AI (Phase 12). It plays one side by the same rules as the
 * player: it reads the match state and the lane (what is on screen) and acts
 * only by emitting the same `*-requested` events the HUD sends, which the
 * systems validate as usual. It never changes state itself.
 *
 * Every `thinkIntervalMs` (its reaction delay) it, in order:
 * - ages up once it has the XP (after `ageUpDelayMs`);
 * - fires the special when enough player units are on the lane (easy and
 *   normal only while they are near its base);
 * - with no army and too little gold for a fighter, sells a turret;
 * - if player units are near its base, buys fighters and nothing else;
 * - otherwise may modernize outdated turrets, buy a money unit when its army
 *   clearly outweighs the player's, build or upgrade turrets on its
 *   schedule, and buys units: fighters chosen at random (easy) or to counter
 *   what the player fields (melee against ranged, heavy against melee,
 *   ranged against heavy), with a utility unit every few fighters.
 * It keeps a small gold reserve for fighters before spending on anything else.
 *
 * Emits: `buy-unit-requested`, `buy-slot-requested`, `buy-turret-requested`,
 * `upgrade-turret-requested`, `sell-turret-requested`, `age-up-requested`,
 * `special-requested`.
 */
export class AIController {
  private readonly state: MatchState;
  private readonly side: Side;
  private readonly units: UnitFactory;
  private readonly bases: Record<Side, Base>;
  private readonly difficulty: AiDifficulty;
  private nextThinkAt = 0;
  private ageUpReadySince: number | null = null;
  private fightersSinceUtility = 0;
  /**
   * The fighter slot it has decided to buy next and is saving up for
   * (owner, 2026-09-26: the AI used to buy whatever it could afford the
   * moment it could, which with a small income meant only first-slot units).
   */
  private plannedSlot: 1 | 2 | 3 | null = null;

  constructor(
    state: MatchState,
    side: Side,
    units: UnitFactory,
    bases: Record<Side, Base>,
    difficulty: AiDifficulty,
  ) {
    this.state = state;
    this.side = side;
    this.units = units;
    this.bases = bases;
    this.difficulty = difficulty;
  }

  /** `nowMs` is the simulation clock. */
  update(nowMs: number): void {
    if (this.state.phase !== 'playing' || nowMs < this.nextThinkAt) return;
    this.nextThinkAt = nowMs + this.difficulty.thinkIntervalMs;
    this.think(nowMs);
  }

  private get me(): SideState {
    return this.state[this.side];
  }

  private think(nowMs: number): void {
    this.tryAgeUp(nowMs);
    const view = this.observe();
    this.trySpecial(nowMs, view);
    if (this.trySellForArmy(view)) return;
    if (view.threat) {
      this.buyUnits(view);
      return;
    }
    if (this.tryModernizeTurrets()) return;
    if (this.tryBuilding(view)) return;
    if (this.tryResearch(view)) return;
    if (this.tryEconomyUnit(view)) return;
    if (this.tryTurret(nowMs)) return;
    if (this.tryUpgradeTurret()) return;
    this.buyUnits(view);
  }

  /* ---- Observing ------------------------------------------------------- */

  private observe(): LaneView {
    const view: LaneView = {
      theirs: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      theirValue: 0,
      theirCount: 0,
      mine: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      myValue: 0,
      myCombat: 0,
      threat: false,
    };
    const home = this.bases[this.side];
    for (const unit of this.units.activeUnits) {
      if (!unit.isAlive) continue;
      const { slot, cost, role } = unit.definition;
      if (unit.side === this.side) {
        view.mine[slot]++;
        view.myValue += cost;
        if (role === 'combat') view.myCombat++;
      } else {
        view.theirs[slot]++;
        view.theirValue += cost;
        view.theirCount++;
        if (Math.abs(unit.x - home.x) - unit.halfWidth <= AI_THREAT_DISTANCE) view.threat = true;
      }
    }
    for (const queued of this.me.trainingQueue) {
      const def = getUnitDefinition(queued.unitId);
      view.mine[def.slot]++;
      view.myValue += def.cost;
      if (def.role === 'combat') view.myCombat++;
    }
    return view;
  }

  /** Gold kept back for fighters before spending on turrets or money units. */
  /** Gold kept back from turrets, buildings and research: 2 cheap fighters, or the unit it is saving for. */
  private get reserve(): number {
    const unitIds = getAge(this.me.age).unitIds;
    const cheap = getUnitDefinition(unitIds[0]).cost * 2;
    const planned = this.plannedSlot === null ? 0 : getUnitDefinition(unitIds[this.plannedSlot - 1]).cost;
    return Math.max(cheap, planned);
  }

  /* ---- Decisions --------------------------------------------------------- */

  private tryAgeUp(nowMs: number): void {
    const cost = getAge(this.me.age).xpToNext;
    if (cost === null || this.me.xp < cost) {
      this.ageUpReadySince = null;
      return;
    }
    if (this.ageUpReadySince === null) this.ageUpReadySince = nowMs;
    if (nowMs - this.ageUpReadySince >= this.difficulty.ageUpDelayMs) {
      emit(Events.AgeUpRequested, { side: this.side });
      this.ageUpReadySince = null;
    }
  }

  private trySpecial(nowMs: number, view: LaneView): void {
    const d = this.difficulty;
    if (this.me.specialReadyAt > nowMs) return;
    if (d.specialOnlyWhenThreatened && !view.threat) return;
    if (view.theirCount >= d.specialMinTargets) {
      emit(Events.SpecialRequested, { side: this.side });
    }
  }

  /**
   * With no army, no threat and not enough gold for even the cheapest
   * fighter, gold never comes back on its own (there is no passive income),
   * so it sells its most valuable turret to raise a new army.
   */
  private trySellForArmy(view: LaneView): boolean {
    if (view.threat || view.myCombat > 0) return false;
    const cheapest = getUnitDefinition(getAge(this.me.age).unitIds[0]).cost;
    if (this.me.gold >= cheapest) return false;
    let pick = -1;
    let best = 0;
    this.me.turrets.forEach((turret, slotIndex) => {
      const refund = turret ? turretSellRefund(turret) : 0;
      if (refund > best) {
        best = refund;
        pick = slotIndex;
      }
    });
    if (pick < 0) return false;
    emit(Events.SellTurretRequested, { side: this.side, slotIndex: pick });
    return true;
  }

  /** Queue depth it keeps: its preset's, or the full queue when rich. */
  private get queueLimit(): number {
    const heavy = getUnitDefinition(getAge(this.me.age).unitIds[2]).cost;
    return this.me.gold >= heavy * AI_RICH_GOLD_MULT ? UNIT_QUEUE_LIMIT : this.difficulty.maxQueue;
  }

  private buyUnits(view: LaneView): void {
    if (this.me.trainingQueue.length >= this.queueLimit) return;
    const unitIds = getAge(this.me.age).unitIds;
    const d = this.difficulty;
    if (d.utilityEvery > 0 && this.fightersSinceUtility >= d.utilityEvery && view.myCombat >= 2) {
      if (this.request(unitIds[4])) {
        this.fightersSinceUtility = 0;
        return;
      }
    }
    // Decide what to buy first, then save up for it, instead of buying
    // whatever is affordable right now (that was always the first slot).
    if (this.plannedSlot === null) {
      this.plannedSlot = d.unitChoice === 'random' ? this.randomSlot() : this.counterSlot(view, false);
    }
    const planned = unitIds[this.plannedSlot - 1];
    if (this.me.gold >= getUnitDefinition(planned).cost) {
      if (this.request(planned)) {
        this.fightersSinceUtility++;
        this.plannedSlot = null;
      }
      return;
    }
    // Still saving. Only when enemies are at the gate and it has no fighter
    // left does it grab the best unit it can afford right now.
    if (view.threat && view.myCombat === 0) {
      const slot = this.counterSlot(view, true);
      if (this.request(unitIds[slot - 1])) this.fightersSinceUtility++;
    }
  }

  /**
   * The fighter slot that best answers the player's army while keeping ours
   * mixed: melee beats massed ranged, heavy tramples massed melee, ranged
   * wears down heavies. With `affordableOnly`, only slots it can pay for now.
   */
  private counterSlot(view: LaneView, affordableOnly: boolean): 1 | 2 | 3 {
    const weights: Record<1 | 2 | 3, number> = {
      1: 1 + 0.6 * view.theirs[2],
      2: 1 + 0.6 * view.theirs[3],
      3: 0.5 + 0.6 * view.theirs[1],
    };
    const unitIds = getAge(this.me.age).unitIds;
    let best: 1 | 2 | 3 = 1;
    let bestScore = -Infinity;
    for (const slot of [1, 2, 3] as const) {
      const unitId = unitIds[slot - 1];
      if (affordableOnly && getUnitDefinition(unitId).cost > this.me.gold) continue;
      const score = (weights[slot] * AI_UNIT_MIX[slot]) / (1 + view.mine[slot]);
      if (score > bestScore) {
        best = slot;
        bestScore = score;
      }
    }
    return best;
  }

  /** Easy: a random fighter slot, weighted by `AI_UNIT_MIX`. */
  private randomSlot(): 1 | 2 | 3 {
    const total = AI_UNIT_MIX[1] + AI_UNIT_MIX[2] + AI_UNIT_MIX[3];
    let roll = Math.random() * total;
    for (const slot of [1, 2, 3] as const) {
      roll -= AI_UNIT_MIX[slot];
      if (roll <= 0) return slot;
    }
    return 1;
  }

  private tryEconomyUnit(view: LaneView): boolean {
    const d = this.difficulty;
    if (this.me.trainingQueue.length >= d.maxQueue) return false;
    if (view.mine[4] >= d.economyUnitsMax || view.myCombat < 3) return false;
    if (view.myValue < d.economySafetyRatio * Math.max(1, view.theirValue)) return false;
    const unitId = getAge(this.me.age).unitIds[3];
    if (this.me.gold < getUnitDefinition(unitId).cost + this.reserve) return false;
    return this.request(unitId);
  }

  /**
   * Buildings (Phase 14): once it has a small army, levels up the lowest
   * building (Mine first on ties), up to its difficulty's cap. The first
   * Mine needs no reserve: with no passive income it is the way out of an
   * empty purse.
   */
  private tryBuilding(view: LaneView): boolean {
    if (view.myCombat < 2) return false;
    const me = this.me;
    let pick: BuildingId | null = null;
    for (const id of BUILDING_ORDER) {
      if (me.buildings[id] >= this.difficulty.buildingLevelCap) continue;
      const rejection = buildingRejection(me, id);
      if (rejection === 'max-level' || rejection === 'age-locked') continue;
      if (pick === null || me.buildings[id] < me.buildings[pick]) pick = id;
    }
    if (pick === null) return false;
    const cost = buildingUpgradeCost(pick, me.buildings[pick]);
    const reserve = pick === 'mine' && me.buildings.mine === 0 ? 0 : this.reserve;
    if (cost === null || me.gold < cost + reserve) return false;
    emit(Events.UpgradeBuildingRequested, { side: this.side, buildingId: pick });
    return true;
  }

  /** Research (Phase 14): the cheapest open track, with gold to spare. */
  private tryResearch(view: LaneView): boolean {
    if (view.myCombat < 3) return false;
    const me = this.me;
    let pick: ResearchId | null = null;
    let cheapest = Infinity;
    for (const def of RESEARCH) {
      if (me.research[def.id] >= this.difficulty.researchTierCap) continue;
      const rejection = researchRejection(me, def.id);
      if (rejection === 'max-tier' || rejection === 'forge-level') continue;
      const cost = researchCost(def.id, me.research[def.id]) ?? Infinity;
      if (cost < cheapest) {
        cheapest = cost;
        pick = def.id;
      }
    }
    if (pick === null || me.gold < cheapest + this.reserve * 2) return false;
    emit(Events.ResearchRequested, { side: this.side, researchId: pick });
    return true;
  }

  private tryTurret(nowMs: number): boolean {
    const d = this.difficulty;
    if (d.turretSlots <= 0 || nowMs < d.firstTurretAtMs) return false;
    const me = this.me;
    const wanted = Math.min(d.turretSlots, MAX_TURRET_SLOTS);
    for (let slotIndex = 0; slotIndex < wanted; slotIndex++) {
      if (me.turrets[slotIndex]) continue;
      if (slotIndex >= me.unlockedSlots) {
        const unlock = slotUnlockCost(slotIndex);
        if (unlock === undefined || me.gold < unlock + this.reserve) return false;
        emit(Events.BuySlotRequested, { side: this.side });
        return true;
      }
      const turretId = this.turretFor(slotIndex);
      if (me.gold < getTurretDefinition(turretId).cost + this.reserve) return false;
      emit(Events.BuyTurretRequested, { side: this.side, slotIndex, turretId });
      return true;
    }
    return false;
  }

  private tryUpgradeTurret(): boolean {
    const maxLevel = this.difficulty.turretUpgradeLevel;
    if (maxLevel <= 0) return false;
    let pick = -1;
    let lowest = Infinity;
    this.me.turrets.forEach((turret, slotIndex) => {
      if (turret && turret.level < maxLevel && turret.level < lowest) {
        lowest = turret.level;
        pick = slotIndex;
      }
    });
    const turret = pick >= 0 ? this.me.turrets[pick] : null;
    if (!turret) return false;
    const next = getTurretDefinition(turret.turretId).upgrades[turret.level];
    if (!next || this.me.gold < next.cost + this.reserve) return false;
    emit(Events.UpgradeTurretRequested, { side: this.side, slotIndex: pick });
    return true;
  }

  /** Sells a turret from an older age and builds the current age's of the same kind. */
  private tryModernizeTurrets(): boolean {
    if (!this.difficulty.modernizesTurrets) return false;
    const me = this.me;
    for (let slotIndex = 0; slotIndex < me.turrets.length; slotIndex++) {
      const turret = me.turrets[slotIndex];
      if (!turret) continue;
      const def = getTurretDefinition(turret.turretId);
      if (def.age >= me.age) continue;
      const replacement = this.turretOfKind(def.kind);
      const price = getTurretDefinition(replacement).cost - turretSellRefund(turret);
      if (me.gold < price + this.reserve) return false;
      emit(Events.SellTurretRequested, { side: this.side, slotIndex });
      emit(Events.BuyTurretRequested, { side: this.side, slotIndex, turretId: replacement });
      return true;
    }
    return false;
  }

  private turretFor(slotIndex: number): string {
    return this.turretOfKind(TURRET_ORDER[slotIndex % TURRET_ORDER.length] ?? 'rapid');
  }

  private turretOfKind(kind: TurretKind): string {
    const ids = getAge(this.me.age).turretIds;
    return ids.find((id) => getTurretDefinition(id).kind === kind) ?? ids[0] ?? '';
  }

  /** Emits a unit purchase and reports whether it went through. */
  private request(unitId: string): boolean {
    const before = this.me.trainingQueue.length;
    emit(Events.BuyUnitRequested, { side: this.side, unitId });
    return this.me.trainingQueue.length > before;
  }
}
