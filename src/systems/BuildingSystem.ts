import { getAge } from '@config/ages.config';
import {
  BUILDINGS,
  buildingUpgradeCost,
  getResearch,
  maxBuildingLevel,
  MAX_RESEARCH_TIER,
  RESEARCH,
  researchCost,
  researchMult,
  type BuildingId,
  type ResearchDefinition,
  type ResearchId,
} from '@config/buildings.config';
import type { UnitFactory } from '@entities/UnitFactory';
import { addGold, addXp, trySpendGold } from '@state/economyOps';
import type { MatchState, SideState } from '@state/GameState';
import { SIDES, type Side } from '@state/types';
import { setSideModifier } from '@systems/statusOps';
import { emit, Events, on } from '@utils/EventBus';

/** Why a building upgrade can't happen right now, or null if it can. */
export type BuildingRejection = 'max-level' | 'age-locked' | 'gold';
/** Why a research tier can't be bought right now, or null if it can. */
export type ResearchRejection = 'max-tier' | 'forge-level' | 'gold';

/** Pure checks, shared by the system, the HUD and the AI. */
export function buildingRejection(side: SideState, id: BuildingId): BuildingRejection | null {
  const level = side.buildings[id];
  const cost = buildingUpgradeCost(id, level);
  if (cost === null) return 'max-level';
  if (level + 1 > maxBuildingLevel(side.age)) return 'age-locked';
  if (side.gold < cost) return 'gold';
  return null;
}

export function researchRejection(side: SideState, id: ResearchId): ResearchRejection | null {
  const tier = side.research[id];
  const cost = researchCost(id, tier);
  if (cost === null || tier >= MAX_RESEARCH_TIER) return 'max-tier';
  if (tier + 1 > side.buildings.forge) return 'forge-level';
  if (side.gold < cost) return 'gold';
  return null;
}

/** Mine gold/s for a side right now (level and age factor). */
export function mineGoldPerSec(side: SideState): number {
  const level = side.buildings.mine;
  if (level <= 0) return 0;
  return (BUILDINGS.mine.goldPerSec?.[level - 1] ?? 0) * getAge(side.age).scale;
}

/** Library XP/s for a side right now (level and age factor). */
export function libraryXpPerSec(side: SideState): number {
  const level = side.buildings.library;
  if (level <= 0) return 0;
  return (BUILDINGS.library.xpPerSec?.[level - 1] ?? 0) * getAge(side.age).scale;
}

function researchModifierId(id: ResearchId): string {
  return `research-${id}`;
}

/**
 * Buildings behind each base (Mine, Library, Forge) and Forge research
 * (Phase 14). Buildings can't be attacked or sold; levels are capped by age
 * (`maxBuildingLevel`) and research tiers by the Forge level.
 *
 * - Mine: gold per second (paid in whole gold, fractions carry over).
 * - Library: XP per second (same carry).
 * - Research on units is applied as side-wide modifiers through `statusOps`
 *   (so later units get it too); turret research is read by `Turret.getStat`
 *   and Plunder by `EconomySystem`, straight from `SideState.research`.
 *
 * This system has no sprites; `GameScene` draws the buildings.
 *
 * Listens for: `upgrade-building-requested`, `research-requested`.
 * Emits: `building-upgraded`, `research-completed`; `gold-changed` and
 * `xp-changed` through economyOps; `modifier-applied` through statusOps.
 */
export class BuildingSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly goldCarry: Record<Side, number> = { player: 0, enemy: 0 };
  private readonly xpCarry: Record<Side, number> = { player: 0, enemy: 0 };
  private readonly cleanups: (() => void)[];

  constructor(state: MatchState, units: UnitFactory) {
    this.state = state;
    this.units = units;
    this.cleanups = [
      on(Events.UpgradeBuildingRequested, ({ side, buildingId }) => this.onUpgrade(side, buildingId)),
      on(Events.ResearchRequested, ({ side, researchId }) => this.onResearch(side, researchId)),
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
    emit(Events.BuildingUpgraded, { side, buildingId: id, level: sideState.buildings[id] });
  }

  private onResearch(side: Side, id: ResearchId): void {
    const sideState = this.state[side];
    if (!RESEARCH.some((r) => r.id === id) || researchRejection(sideState, id) !== null) return;
    const cost = researchCost(id, sideState.research[id]);
    if (cost === null || !trySpendGold(this.state, side, cost, 'purchase')) return;
    sideState.research[id] += 1;
    this.applyUnitResearch(side, getResearch(id), sideState.research[id]);
    emit(Events.ResearchCompleted, { side, researchId: id, tier: sideState.research[id] });
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
