import { getAge, isFinalAge } from '@config/ages.config';
import {
  activeBuildingIds,
  BUILDING_OUTPUT,
  BUILDING_PERKS,
  BUILDINGS,
  buildingUpgradeCost,
  forgeLevelForTier,
  getResearch,
  maxBuildingLevel,
  MAX_RESEARCH_TIER,
  perksPending,
  RESEARCH,
  researchCost,
  researchMult,
  type BuildingId,
  type PerkChoice,
  type PerkStat,
  type ResearchDefinition,
  type ResearchId,
} from '@config/buildings.config';
import type { UnitFactory } from '@entities/UnitFactory';
import { addGold, addXp, spendXp, trySpendGold } from '@state/economyOps';
import type { MatchState, SideState } from '@state/GameState';
import { SIDES, type Side } from '@state/types';
import { setSideModifier } from '@systems/statusOps';
import { emit, Events, on } from '@utils/EventBus';

/** Why a building upgrade can't happen right now, or null if it can. */
/** `closed`: a Conquest reward (Robber baron) closed the Mine. */
export type BuildingRejection = 'inactive' | 'max-level' | 'age-locked' | 'closed' | 'gold';
/** Why a research tier can't be bought right now, or null if it can. */
export type ResearchRejection = 'max-tier' | 'forge-level' | 'gold';

/** Everything a side's building levels and perks multiply (1 = no change). */
export type BuildingEffects = Record<PerkStat, number>;

/**
 * The multipliers from a side's buildings and their perks: Forge (+unit
 * damage per level), Barracks (training time, unit max HP), Shrine (special
 * cooldown and damage), and every perk picked. Read by the systems that
 * apply them (Spawn, Special, Economy, this one).
 */
export function buildingEffects(side: SideState): BuildingEffects {
  const b = side.buildings;
  const o = BUILDING_OUTPUT;
  const fx: BuildingEffects = {
    mineGold: 1,
    libraryXp: 1,
    killGold: 1,
    specialCooldown: 1 - o.shrineCooldownPerLevel * b.shrine,
    specialDamage: 1 + o.shrineDamagePerLevel * b.shrine,
    researchCost: 1,
    unitHp: 1 + o.barracksHpPerLevel * b.barracks,
    unitDamage: 1 + o.forgeDamagePerLevel * b.forge,
    trainTime: Math.max(o.barracksMinTime, 1 - o.barracksTimePerLevel * b.barracks),
    marketRate: 1,
    moneyIncome: 1,
  };
  for (const id of activeBuildingIds()) {
    for (const choice of side.buildingPerks[id]) {
      const perk = BUILDING_PERKS[id][choice];
      fx[perk.stat] *= perk.mult;
    }
  }
  // Conquest traits: the Mine grows or is closed; money units earn more.
  fx.mineGold *= side.traits.mineClosed ? 0 : side.traits.mineMult;
  fx.moneyIncome *= side.traits.moneyIncome;
  return fx;
}

/** Pure checks, shared by the system, the HUD and the AI. */
export function buildingRejection(side: SideState, id: BuildingId): BuildingRejection | null {
  if (!activeBuildingIds().includes(id)) return 'inactive';
  if (id === 'mine' && side.traits.mineClosed) return 'closed';
  const level = side.buildings[id];
  const cost = buildingUpgradeCost(id, level);
  if (cost === null) return 'max-level';
  if (level + 1 > maxBuildingLevel(side.age)) return 'age-locked';
  if (side.gold < cost) return 'gold';
  return null;
}

/** Price of a side's next tier of a research track (perks can make it cheaper), or null when maxed. */
export function researchPrice(side: SideState, id: ResearchId): number | null {
  const cost = researchCost(id, side.research[id]);
  return cost === null ? null : Math.round(cost * buildingEffects(side).researchCost);
}

export function researchRejection(side: SideState, id: ResearchId): ResearchRejection | null {
  const tier = side.research[id];
  const cost = researchPrice(side, id);
  if (cost === null || tier >= MAX_RESEARCH_TIER) return 'max-tier';
  if (side.buildings.forge < forgeLevelForTier(tier + 1)) return 'forge-level';
  if (side.gold < cost) return 'gold';
  return null;
}

/** Output of a level (Mine gold/s, Library XP/s, Market XP/s traded) before the age factor. */
function perLevel(spec: { first: number; perLevel: number }, level: number): number {
  return level <= 0 ? 0 : spec.first + spec.perLevel * (level - 1);
}

/** Mine gold/s for a side right now (level, age factor, perks). */
export function mineGoldPerSec(side: SideState): number {
  return perLevel(BUILDING_OUTPUT.mine, side.buildings.mine) * getAge(side.age).scale * buildingEffects(side).mineGold;
}

/** Mine gold/s a side would have at `level` (same age and perks). */
export function mineGoldAt(side: SideState, level: number): number {
  return perLevel(BUILDING_OUTPUT.mine, level) * getAge(side.age).scale * buildingEffects(side).mineGold;
}

/** Library XP/s for a side right now. */
export function libraryXpPerSec(side: SideState): number {
  return perLevel(BUILDING_OUTPUT.library, side.buildings.library) * getAge(side.age).scale * buildingEffects(side).libraryXp;
}

export function libraryXpAt(side: SideState, level: number): number {
  return perLevel(BUILDING_OUTPUT.library, level) * getAge(side.age).scale * buildingEffects(side).libraryXp;
}

/** Market: surplus XP it sells per second at most (0 without a Market). */
export function marketXpPerSec(side: SideState): number {
  if (!activeBuildingIds().includes('market')) return 0;
  return perLevel(BUILDING_OUTPUT.market, side.buildings.market) * getAge(side.age).scale * buildingEffects(side).marketRate;
}

/** XP the side doesn't need for its next age-up (all of it in the final age). */
export function surplusXp(side: SideState): number {
  // No age-up ahead (the last age, or an age-locked Conquest battle): all XP is surplus.
  if (isFinalAge(side.age) || side.age >= side.maxAge) return side.xp;
  const toNext = getAge(side.age).xpToNext ?? 0;
  return Math.max(0, side.xp - toNext);
}

function researchModifierId(id: ResearchId): string {
  return `research-${id}`;
}

const UNIT_DAMAGE_MOD = 'building-unit-damage';
const UNIT_HP_MOD = 'building-unit-hp';

/**
 * Buildings behind each base and Forge research (Phase 14; levels reworked
 * 2026-09-26: five per age, see `config/buildings.config.ts`). Buildings
 * can't be attacked or sold; levels are capped by age (`maxBuildingLevel`)
 * and research tiers by the Forge level (`forgeLevelForTier`).
 *
 * - Mine: gold per second; Library: XP per second (whole units, fractions
 *   carry over); Market (prototype): sells surplus XP for gold.
 * - Forge, Barracks and perks change unit damage and max HP through
 *   side-wide modifiers (`statusOps`, so later units get them too); training
 *   time, special strength, kill gold and money-unit income are read from
 *   `buildingEffects` by the systems that own them.
 * - Perks (prototype): every fifth level earns a pick between two perks.
 *
 * This system has no sprites; `GameScene` draws the buildings.
 *
 * Listens for: `upgrade-building-requested`, `research-requested`,
 * `choose-perk-requested`.
 * Emits: `building-upgraded`, `research-completed`, `building-perk-chosen`;
 * `gold-changed` and `xp-changed` through economyOps; `modifier-applied`
 * through statusOps.
 */
export class BuildingSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly goldCarry: Record<Side, number> = { player: 0, enemy: 0 };
  private readonly xpCarry: Record<Side, number> = { player: 0, enemy: 0 };
  private readonly tradeCarry: Record<Side, number> = { player: 0, enemy: 0 };
  private readonly cleanups: (() => void)[];

  constructor(state: MatchState, units: UnitFactory) {
    this.state = state;
    this.units = units;
    this.cleanups = [
      on(Events.UpgradeBuildingRequested, ({ side, buildingId }) => this.onUpgrade(side, buildingId)),
      on(Events.ResearchRequested, ({ side, researchId }) => this.onResearch(side, researchId)),
      on(Events.ChoosePerkRequested, ({ side, buildingId, choice }) => this.onChoosePerk(side, buildingId, choice)),
    ];
  }

  /** `deltaMs` is simulation time; call only while the match is playing. */
  update(deltaMs: number): void {
    for (const side of SIDES) {
      const sideState = this.state[side];
      const gold = mineGoldPerSec(sideState);
      if (gold > 0) {
        this.goldCarry[side] += (gold * deltaMs) / 1000;
        const whole = Math.floor(this.goldCarry[side]);
        if (whole > 0) {
          this.goldCarry[side] -= whole;
          addGold(this.state, side, whole, 'mine');
        }
      }
      const xp = libraryXpPerSec(sideState);
      if (xp > 0) {
        this.xpCarry[side] += (xp * deltaMs) / 1000;
        const whole = Math.floor(this.xpCarry[side]);
        if (whole > 0) {
          this.xpCarry[side] -= whole;
          addXp(this.state, side, whole);
        }
      }
      const trade = marketXpPerSec(sideState);
      if (trade > 0) {
        this.tradeCarry[side] = Math.min(this.tradeCarry[side] + (trade * deltaMs) / 1000, trade * 2);
        const whole = Math.min(Math.floor(this.tradeCarry[side]), Math.floor(surplusXp(sideState)));
        if (whole > 0 && spendXp(this.state, side, whole)) {
          this.tradeCarry[side] -= whole;
          addGold(this.state, side, whole * BUILDING_OUTPUT.market.goldPerXp, 'market');
        }
      }
    }
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  private onUpgrade(side: Side, id: BuildingId): void {
    const sideState = this.state[side];
    if (!BUILDINGS[id] || buildingRejection(sideState, id) !== null) return;
    const cost = buildingUpgradeCost(id, sideState.buildings[id]);
    if (cost === null || !trySpendGold(this.state, side, cost, 'purchase')) return;
    sideState.buildings[id] += 1;
    this.applyUnitModifiers(side);
    emit(Events.BuildingUpgraded, { side, buildingId: id, level: sideState.buildings[id] });
  }

  private onChoosePerk(side: Side, id: BuildingId, choice: PerkChoice): void {
    const sideState = this.state[side];
    if (!BUILDINGS[id] || (choice !== 'a' && choice !== 'b')) return;
    if (perksPending(sideState.buildings[id], sideState.buildingPerks[id].length) <= 0) return;
    sideState.buildingPerks[id].push(choice);
    this.applyUnitModifiers(side);
    emit(Events.BuildingPerkChosen, { side, buildingId: id, choice, picks: sideState.buildingPerks[id].length });
  }

  private onResearch(side: Side, id: ResearchId): void {
    const sideState = this.state[side];
    if (!RESEARCH.some((r) => r.id === id) || researchRejection(sideState, id) !== null) return;
    const cost = researchPrice(sideState, id);
    if (cost === null || !trySpendGold(this.state, side, cost, 'purchase')) return;
    sideState.research[id] += 1;
    this.applyUnitResearch(side, getResearch(id), sideState.research[id]);
    emit(Events.ResearchCompleted, { side, researchId: id, tier: sideState.research[id] });
  }

  /** Forge / Barracks levels and perks as side-wide unit modifiers. */
  private applyUnitModifiers(side: Side): void {
    const fx = buildingEffects(this.state[side]);
    const units = this.units.activeUnits;
    setSideModifier(this.state, units, side, {
      id: UNIT_DAMAGE_MOD,
      source: 'building',
      stat: 'damage',
      mult: fx.unitDamage,
      onlySlots: [1, 2, 3],
    });
    setSideModifier(this.state, units, side, { id: UNIT_HP_MOD, source: 'building', stat: 'maxHp', mult: fx.unitHp });
  }

  private applyUnitResearch(side: Side, def: ResearchDefinition, tier: number): void {
    const target = def.target;
    if (target.kind !== 'unit') return;
    setSideModifier(this.state, this.units.activeUnits, side, {
      id: researchModifierId(def.id),
      source: 'research',
      stat: target.stat,
      mult: Math.max(0, researchMult(def.id, tier)),
      onlySlots: target.slots,
    });
  }
}
