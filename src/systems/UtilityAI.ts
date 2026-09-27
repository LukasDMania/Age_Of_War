import {
  aiBuildingCap,
  AI_RICH_GOLD_MULT,
  AI_THREAT_DISTANCE,
  openingArmyCap,
  type AiDifficulty,
} from '@config/ai.config';
import type { AiGenome } from '@config/aiGenome.config';
import { getAge } from '@config/ages.config';
import {
  activeBuildingIds,
  buildingUpgradeCost,
  getResearch,
  perksPending,
  RESEARCH,
  type BuildingId,
  type PerkChoice,
  type ResearchDefinition,
  type ResearchId,
} from '@config/buildings.config';
import { baseMaxHp, MAX_TURRET_SLOTS, UNIT_QUEUE_LIMIT } from '@config/constants';
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
import { ageGap } from '@systems/ageCatchUp';
import {
  buildingRejection,
  libraryXpAt,
  libraryXpPerSec,
  mineGoldAt,
  mineGoldPerSec,
  researchPrice,
  researchRejection,
  surplusXp,
} from '@systems/BuildingSystem';
import { emit, Events } from '@utils/EventBus';

type Slot = 1 | 2 | 3 | 4 | 5;

/** What the brain sees when it thinks. Values are gold unless noted. */
interface View {
  now: number;
  /** Price of the current age's slot-1 unit: the unit of account for army sizes. */
  cheap: number;
  mine: Record<Slot, number>;
  theirs: Record<Slot, number>;
  myValue: number;
  theirValue: number;
  myCombat: number;
  /** Enemy value within `AI_THREAT_DISTANCE` of the base. */
  threatValue: number;
  /** 0..1: how hurt the base is. */
  baseHurt: number;
}

/** One thing the brain could do now. */
interface Option {
  label: string;
  score: number;
  cost: number;
  /** Units don't have to leave the emergency reserve. */
  unit: boolean;
  act: () => boolean;
}

const TURRET_KINDS: readonly TurretKind[] = ['rapid', 'heavy', 'area'];

/**
 * The "utility AI" (2026-09-26): an enemy brain whose strategy is a genome
 * of weights (`config/aiGenome.config.ts`) instead of fixed rules, so it can
 * be tuned by machine learning (`tools/train-ai.mjs`: self-play evolution)
 * and given personalities (the AI profiles in the menu).
 *
 * Every think (the difficulty's reaction time) it:
 * 1. ages up once it has the XP (after `ageUpDelay`), fires the special by
 *    its rules, and handles emergencies (no army with enemies at the gate:
 *    buy the best fighter it can afford; broke with no army: sell a turret);
 * 2. scores every option: each fighter slot, a utility or money unit, the
 *    next level of each building, the best research track, a new turret (or
 *    the slot for it), a turret upgrade, replacing an outdated turret. Scores
 *    come from what it sees (army values and composition on both sides,
 *    threat near its base, base HP, incomes, payback times) times its genes;
 * 3. takes the best option if it can pay for it; if not, saves up when that
 *    wish is strong enough (`saveThreshold`), otherwise takes the best option
 *    it can afford.
 * With a lot of gold banked it also fills its training queue, so gold never
 * piles up. Like the classic AI it respects the difficulty's opening, queue
 * depth and building / research caps, and acts only through the same
 * `*-requested` events as the player.
 *
 * Emits: `buy-unit-requested`, `buy-slot-requested`, `buy-turret-requested`,
 * `upgrade-turret-requested`, `sell-turret-requested`, `age-up-requested`,
 * `special-requested`, `upgrade-building-requested`, `research-requested`.
 */
export class UtilityAI {
  private readonly state: MatchState;
  private readonly side: Side;
  private readonly units: UnitFactory;
  private readonly bases: Record<Side, Base>;
  private readonly difficulty: AiDifficulty;
  private readonly g: AiGenome;
  private nextThinkAt = 0;
  private ageUpReadySince: number | null = null;
  private fightersSinceUtility = 0;
  /** What it did (or wanted) last think, for the debug handle. */
  lastDecision = '';

  constructor(
    state: MatchState,
    side: Side,
    units: UnitFactory,
    bases: Record<Side, Base>,
    difficulty: AiDifficulty,
    genome: AiGenome,
  ) {
    this.state = state;
    this.side = side;
    this.units = units;
    this.bases = bases;
    this.difficulty = difficulty;
    this.g = genome;
  }

  update(nowMs: number): void {
    if (this.state.phase !== 'playing' || nowMs < this.nextThinkAt) return;
    this.nextThinkAt = nowMs + this.difficulty.thinkIntervalMs;
    this.think(nowMs);
  }

  private get me(): SideState {
    return this.state[this.side];
  }

  private think(now: number): void {
    this.tryAgeUp(now);
    const view = this.observe(now);
    this.trySpecial(view);
    this.tryPerks();
    if (this.emergency(view)) return;
    const options = this.options(view);
    if (options.length === 0) {
      this.lastDecision = 'nothing to do';
      return;
    }
    options.sort((a, b) => b.score - a.score);
    const best = options[0]!;
    if (best.score <= 0) {
      this.lastDecision = `idle (best ${best.label} ${best.score.toFixed(2)})`;
      return;
    }
    const reserve = this.g.reserve * view.cheap;
    const spendable = (o: Option): boolean => this.me.gold - (o.unit ? 0 : reserve) >= o.cost;
    if (spendable(best)) {
      this.take(best);
    } else if (best.score >= this.g.saveThreshold) {
      this.lastDecision = `saving for ${best.label} (${best.cost})`;
    } else {
      const fallback = options.find((o) => o.score > 0 && spendable(o));
      if (fallback) this.take(fallback);
      else this.lastDecision = `waiting (best ${best.label})`;
    }
    // Rich: turn banked gold into units too (no late-game stalls).
    if (this.me.gold >= this.heavyCost * AI_RICH_GOLD_MULT) this.buyFighter(view, true);
  }

  private take(option: Option): void {
    const ok = option.act();
    this.lastDecision = `${ok ? '' : 'failed '}${option.label} (${option.score.toFixed(2)})`;
  }

  /* ---- Seeing ---------------------------------------------------------- */

  private observe(now: number): View {
    const v: View = {
      now,
      cheap: getUnitDefinition(getAge(this.me.age).unitIds[0]).cost,
      mine: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      theirs: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      myValue: 0,
      theirValue: 0,
      myCombat: 0,
      threatValue: 0,
      baseHurt: 1 - this.me.baseHp / baseMaxHp(this.me.age),
    };
    const home = this.bases[this.side];
    for (const unit of this.units.activeUnits) {
      if (!unit.isAlive) continue;
      const { slot, cost, role } = unit.definition;
      if (unit.side === this.side) {
        v.mine[slot]++;
        v.myValue += cost;
        if (role === 'combat') v.myCombat++;
      } else {
        v.theirs[slot]++;
        v.theirValue += cost;
        if (Math.abs(unit.x - home.x) - unit.halfWidth <= AI_THREAT_DISTANCE) v.threatValue += cost;
      }
    }
    for (const queued of this.me.trainingQueue) {
      const def = getUnitDefinition(queued.unitId);
      v.mine[def.slot]++;
      v.myValue += def.cost;
      if (def.role === 'combat') v.myCombat++;
    }
    return v;
  }

  private get heavyCost(): number {
    return getUnitDefinition(getAge(this.me.age).unitIds[2]).cost;
  }

  /* ---- Always-on rules ---------------------------------------------------- */

  private tryAgeUp(now: number): void {
    const cost = getAge(this.me.age).xpToNext;
    if (cost === null || this.me.xp < cost) {
      this.ageUpReadySince = null;
      return;
    }
    this.ageUpReadySince ??= now;
    const delay = Math.max(this.g.ageUpDelay * 1000, this.difficulty.ageUpDelayMs);
    // Behind in age (catch-up): no waiting.
    if (ageGap(this.state, this.side) > 0 || now - this.ageUpReadySince >= delay) {
      emit(Events.AgeUpRequested, { side: this.side });
      this.ageUpReadySince = null;
    }
  }

  private trySpecial(v: View): void {
    if (this.me.specialReadyAt > v.now) return;
    const threatened = v.threatValue > 0;
    const defensive = this.g.specialDefensive > 0.5 || this.difficulty.specialOnlyWhenThreatened;
    if (defensive && !threatened) return;
    if (v.now < this.difficulty.opening.specialAfterMs && !threatened) return;
    const targets = v.theirs[1] + v.theirs[2] + v.theirs[3] + v.theirs[4] + v.theirs[5];
    if (targets >= Math.round(this.g.specialTargets)) emit(Events.SpecialRequested, { side: this.side });
  }

  /** Enemies at the gate with no army, or broke with nothing: act now. Returns true if it acted. */
  private emergency(v: View): boolean {
    if (v.threatValue > 0 && v.myCombat === 0) {
      if (this.buyFighter(v, false, true)) {
        this.lastDecision = 'emergency fighter';
        return true;
      }
    }
    if (v.threatValue === 0 && v.myCombat === 0 && this.me.gold < v.cheap) {
      let pick = -1;
      let best = 0;
      this.me.turrets.forEach((t, i) => {
        const refund = t ? turretSellRefund(t) : 0;
        if (refund > best) {
          best = refund;
          pick = i;
        }
      });
      if (pick >= 0) {
        emit(Events.SellTurretRequested, { side: this.side, slotIndex: pick });
        this.lastDecision = 'sold a turret to rebuild an army';
        return true;
      }
    }
    return false;
  }

  /* ---- Options ------------------------------------------------------------ */

  private options(v: View): Option[] {
    const out: Option[] = [];
    const g = this.g;
    const norm = v.cheap * 5;
    const add = (label: string, wish: number, cost: number, unit: boolean, act: () => boolean): void => {
      if (!Number.isFinite(wish) || cost <= 0) return;
      out.push({ label, score: wish - g.costAversion * (cost / norm), cost, unit, act });
    };
    const danger = Math.max(Math.min(1, v.threatValue / (v.cheap * 6)), v.baseHurt);

    // Units.
    const need = (g.armyTarget * v.theirValue + g.armyFloor * v.cheap - v.myValue) / v.cheap;
    const drive =
      g.armyDrive +
      g.armyUrgency * 0.25 * Math.max(-3, Math.min(6, need)) +
      g.threatUnits * 0.25 * Math.min(6, v.threatValue / v.cheap);
    if (this.canQueue(v)) {
      const slot = this.pickFighter(v);
      if (slot !== null) {
        const unitId = getAge(this.me.age).unitIds[slot - 1];
        add(`unit ${slot}`, drive, getUnitDefinition(unitId).cost, true, () => this.buy(unitId, true));
      }
      if (v.myCombat >= 2 && this.fightersSinceUtility >= g.utilityEvery) {
        const unitId = getAge(this.me.age).unitIds[4];
        add('utility unit', drive * 0.9, getUnitDefinition(unitId).cost, true, () => {
          const ok = this.buy(unitId, false);
          if (ok) this.fightersSinceUtility = 0;
          return ok;
        });
      }
      const money = this.moneyWish(v);
      if (money) add('money unit', money.wish, money.cost, false, () => this.buy(money.unitId, false));
    }

    // Buildings.
    for (const id of activeBuildingIds()) {
      const wish = this.buildingWish(id, v);
      const cost = buildingUpgradeCost(id, this.me.buildings[id]);
      if (wish !== null && cost !== null) {
        add(`${id} ${this.me.buildings[id] + 1}`, wish * (1 - 0.6 * danger), cost, false, () => {
          emit(Events.UpgradeBuildingRequested, { side: this.side, buildingId: id });
          return true;
        });
      }
    }

    // Research.
    const research = this.researchWish(v);
    if (research) {
      add(`research ${research.id}`, research.wish * (1 - 0.5 * danger), research.cost, false, () => {
        emit(Events.ResearchRequested, { side: this.side, researchId: research.id });
        return true;
      });
    }

    // Turrets.
    this.turretOptions(v, danger, add);
    return out;
  }

  private canQueue(v: View): boolean {
    const limit = this.queueLimit(v);
    if (this.me.trainingQueue.length >= limit) return false;
    return v.myCombat < openingArmyCap(this.difficulty.opening, v.now, v.threatValue > 0);
  }

  private queueLimit(v: View): number {
    if (v.now < this.difficulty.opening.endsAtMs) return 1;
    return this.me.gold >= this.heavyCost * AI_RICH_GOLD_MULT ? UNIT_QUEUE_LIMIT : this.difficulty.maxQueue;
  }

  /** The fighter slot it wants: its biases, countering, and keeping a mix. */
  private pickFighter(v: View, affordableOnly = false): 1 | 2 | 3 | null {
    const g = this.g;
    const theirFighters = Math.max(1, v.theirs[1] + v.theirs[2] + v.theirs[3]);
    const myFighters = Math.max(1, v.mine[1] + v.mine[2] + v.mine[3]);
    const counter: Record<1 | 2 | 3, number> = {
      1: v.theirs[2] / theirFighters,
      2: v.theirs[3] / theirFighters,
      3: v.theirs[1] / theirFighters,
    };
    const bias: Record<1 | 2 | 3, number> = { 1: g.bias1, 2: g.bias2, 3: g.bias3 };
    const heavyOk = v.now >= this.difficulty.opening.heavyAfterMs;
    const unitIds = getAge(this.me.age).unitIds;
    let total = 0;
    const weights: [1 | 2 | 3, number][] = [];
    for (const slot of [1, 2, 3] as const) {
      if (slot === 3 && !heavyOk) continue;
      if (affordableOnly && getUnitDefinition(unitIds[slot - 1]).cost > this.me.gold) continue;
      const w = (bias[slot] * (1 + g.counter * counter[slot])) / (1 + g.mix * (v.mine[slot] / myFighters) * 3);
      weights.push([slot, w * w]);
      total += w * w;
    }
    if (total <= 0) return null;
    // Sampled, so it isn't predictable, but strongly favours the best slot.
    let roll = Math.random() * total;
    for (const [slot, w] of weights) {
      roll -= w;
      if (roll <= 0) return slot;
    }
    return weights[weights.length - 1]?.[0] ?? null;
  }

  private buyFighter(v: View, rich: boolean, affordableOnly = false): boolean {
    if (!rich && !this.canQueue(v)) return false;
    if (rich && this.me.trainingQueue.length >= UNIT_QUEUE_LIMIT) return false;
    const slot = this.pickFighter(v, affordableOnly);
    if (slot === null) return false;
    return this.buy(getAge(this.me.age).unitIds[slot - 1], true);
  }

  private moneyWish(v: View): { unitId: string; wish: number; cost: number } | null {
    const g = this.g;
    if (v.mine[4] >= Math.round(g.moneyMax) || v.myCombat < 3 || v.threatValue > 0) return null;
    if (v.myValue < g.moneySafety * Math.max(v.cheap, v.theirValue)) return null;
    const unitId = getAge(this.me.age).unitIds[3];
    const def = getUnitDefinition(unitId);
    const income = def.income?.goldPerSecond ?? 0;
    if (income <= 0) return null;
    const payback = def.cost / income;
    return { unitId, wish: g.moneyUnits * Math.max(0, Math.min(3, g.horizon / payback - 0.5)), cost: def.cost };
  }

  private buildingWish(id: BuildingId, v: View): number | null {
    const g = this.g;
    const me = this.me;
    const level = me.buildings[id];
    if (level >= aiBuildingCap(this.difficulty, me.age)) return null;
    const rejection = buildingRejection(me, id);
    if (rejection === 'max-level' || rejection === 'age-locked') return null;
    const cost = buildingUpgradeCost(id, level);
    if (cost === null) return null;
    switch (id) {
      case 'mine': {
        const gain = mineGoldAt(me, level + 1) - mineGoldPerSec(me);
        if (gain <= 0) return null;
        // The first Mine is the way out of an empty purse: no army needed.
        const payback = cost / gain;
        return g.mine * Math.max(-0.5, Math.min(3, g.horizon / payback - 0.5)) * (level === 0 ? 1.4 : 1);
      }
      case 'library': {
        const toNext = getAge(me.age).xpToNext;
        if (toNext === null) return null;
        const gain = libraryXpAt(me, level + 1) - libraryXpPerSec(me);
        if (gain <= 0) return null;
        return g.library * Math.min(3, (gain * g.horizon) / toNext) * (v.myCombat >= 2 ? 1 : 0.3);
      }
      case 'forge': {
        // Worth more the more research tracks are waiting on it.
        let blocked = 0;
        for (const def of RESEARCH) if (me.research[def.id] >= level && me.research[def.id] < this.difficulty.researchTierCap) blocked++;
        return g.forge * (0.3 + blocked / RESEARCH.length) * (v.myCombat >= 2 ? 1 : 0.3);
      }
      // Prototype buildings: rough wishes from the genes it has.
      case 'barracks':
        return g.armyDrive * 0.45 * (v.myCombat >= 3 ? 1 : 0.3);
      case 'shrine':
        return (g.specialTargets <= 3 ? 0.6 : 0.35) * (v.myCombat >= 2 ? 1 : 0.3);
      case 'market':
        return g.library * (surplusXp(me) > 0 ? 0.9 : 0.15);
    }
  }

  /** Building perks (prototype): picks by its genes' leanings. */
  private tryPerks(): void {
    const g = this.g;
    const lean: Record<BuildingId, PerkChoice> = {
      mine: g.mine >= g.focusBounty ? 'a' : 'b',
      library: g.library >= 1 ? 'a' : 'b',
      forge: g.research >= 0.9 ? 'a' : 'b',
      barracks: g.armyDrive >= 1.5 ? 'b' : 'a',
      shrine: g.specialTargets <= 3 ? 'a' : 'b',
      market: g.moneyUnits >= 1 ? 'b' : 'a',
    };
    for (const id of activeBuildingIds()) {
      if (perksPending(this.me.buildings[id], this.me.buildingPerks[id].length) > 0) {
        emit(Events.ChoosePerkRequested, { side: this.side, buildingId: id, choice: lean[id] });
      }
    }
  }

  private researchWish(v: View): { id: ResearchId; wish: number; cost: number } | null {
    const g = this.g;
    const me = this.me;
    if (v.myCombat < 2) return null;
    let best: { id: ResearchId; wish: number; cost: number } | null = null;
    const turretCount = me.turrets.filter(Boolean).length;
    const myFighterValue = Math.max(1, v.myValue);
    for (const def of RESEARCH) {
      if (me.research[def.id] >= this.difficulty.researchTierCap) continue;
      const rejection = researchRejection(me, def.id);
      if (rejection === 'max-tier' || rejection === 'forge-level') continue;
      const cost = researchPrice(me, def.id);
      if (cost === null) continue;
      const wish = g.research * this.researchFocus(def) * this.researchRelevance(def, v, myFighterValue, turretCount) * 4;
      if (!best || wish > best.wish) best = { id: def.id, wish, cost };
    }
    return best;
  }

  private researchFocus(def: ResearchDefinition): number {
    const g = this.g;
    const t = def.target;
    if (t.kind === 'bounty') return g.focusBounty;
    if (t.kind === 'turret') return g.focusTurret;
    const slot = t.slots[0];
    return slot === 1 ? g.focusMelee : slot === 2 ? g.focusRanged : g.focusHeavy;
  }

  /** How much of what it owns a research track would improve (0..1+). */
  private researchRelevance(def: ResearchDefinition, v: View, fighterValue: number, turrets: number): number {
    const t = getResearch(def.id).target;
    if (t.kind === 'bounty') return 0.5;
    if (t.kind === 'turret') return Math.min(1.2, turrets / 3);
    let value = 0;
    const unitIds = getAge(this.me.age).unitIds;
    for (const slot of t.slots) value += v.mine[slot as Slot] * getUnitDefinition(unitIds[slot - 1]).cost;
    return 0.25 + value / fighterValue;
  }

  private turretOptions(
    v: View,
    danger: number,
    add: (label: string, wish: number, cost: number, unit: boolean, act: () => boolean) => void,
  ): void {
    const g = this.g;
    const me = this.me;
    const pressure = 1 + g.turretThreat * danger;
    const built = me.turrets.filter(Boolean).length;
    // Easy keeps its small turret allowance whatever the profile wants.
    const cap = this.difficulty.name === 'easy' ? this.difficulty.turretSlots : MAX_TURRET_SLOTS;
    const target = Math.min(cap, Math.round(g.turretSlots));
    const early = v.now < this.difficulty.firstTurretAtMs;

    // A new turret (or the slot for it).
    if (built < target && !early) {
      const slotIndex = me.turrets.findIndex((t, i) => !t && i < me.unlockedSlots);
      const wish = (g.turrets * pressure) / (1 + built * 0.5);
      if (slotIndex >= 0) {
        const turretId = this.turretFor();
        add(`turret ${getTurretDefinition(turretId).kind}`, wish, getTurretDefinition(turretId).cost, false, () => {
          emit(Events.BuyTurretRequested, { side: this.side, slotIndex, turretId });
          return me.turrets[slotIndex] !== null;
        });
      } else if (me.unlockedSlots < MAX_TURRET_SLOTS) {
        const cost = slotUnlockCost(me.unlockedSlots);
        if (cost !== undefined) {
          add('turret slot', wish * 0.9, cost, false, () => {
            emit(Events.BuySlotRequested, { side: this.side });
            return true;
          });
        }
      }
    }

    // Upgrades and replacing outdated turrets.
    me.turrets.forEach((turret, slotIndex) => {
      if (!turret) return;
      const def = getTurretDefinition(turret.turretId);
      const behind = me.age - def.age;
      if (behind > 0) {
        const replacement = this.turretOfKind(def.kind);
        const price = getTurretDefinition(replacement).cost - turretSellRefund(turret);
        add(`modernize ${slotIndex}`, g.modernize * Math.min(3, behind) * 0.6, Math.max(1, price), false, () => {
          emit(Events.SellTurretRequested, { side: this.side, slotIndex });
          emit(Events.BuyTurretRequested, { side: this.side, slotIndex, turretId: replacement });
          return true;
        });
      }
      const next = def.upgrades[turret.level];
      if (next && turret.level < this.difficulty.turretUpgradeLevel) {
        const wish = g.turretUpgrade * pressure * (1 - turret.level / 3.5) * (behind > 0 ? 0.4 : 1);
        add(`upgrade turret ${slotIndex}`, wish, next.cost, false, () => {
          emit(Events.UpgradeTurretRequested, { side: this.side, slotIndex });
          return true;
        });
      }
    });
  }

  /** The turret kind it prefers next: its biases, spread over kinds it lacks. */
  private turretFor(): string {
    const g = this.g;
    const counts: Record<TurretKind, number> = { rapid: 0, heavy: 0, area: 0 };
    for (const t of this.me.turrets) if (t) counts[getTurretDefinition(t.turretId).kind]++;
    const bias: Record<TurretKind, number> = { rapid: g.kindRapid, heavy: g.kindHeavy, area: g.kindArea };
    let best: TurretKind = 'rapid';
    let bestScore = -Infinity;
    for (const kind of TURRET_KINDS) {
      const score = bias[kind] / (1 + counts[kind]);
      if (score > bestScore) {
        best = kind;
        bestScore = score;
      }
    }
    return this.turretOfKind(best);
  }

  private turretOfKind(kind: TurretKind): string {
    const ids = getAge(this.me.age).turretIds;
    return ids.find((id) => getTurretDefinition(id).kind === kind) ?? ids[0] ?? '';
  }

  /** Emits a unit purchase and reports whether it went through. */
  private buy(unitId: string, fighter: boolean): boolean {
    const before = this.me.trainingQueue.length;
    emit(Events.BuyUnitRequested, { side: this.side, unitId });
    const ok = this.me.trainingQueue.length > before;
    if (ok && fighter) this.fightersSinceUtility++;
    return ok;
  }
}
