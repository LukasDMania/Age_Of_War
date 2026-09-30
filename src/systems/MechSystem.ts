import { AGE_COUNT } from '@config/ages.config';
import { activeBuildingIds, buildingX, type BuildingId } from '@config/buildings.config';
import { BASE_X, LANE_Y } from '@config/constants';
import { feature } from '@config/features.config';
import { MECH, MECH_UTILITY, type MechAbility, type MechDesign } from '@config/mech.config';
import type { Base } from '@entities/Base';
import type { ProjectileFactory } from '@entities/ProjectileFactory';
import { UnitState, type Unit } from '@entities/Unit';
import type { UnitFactory } from '@entities/UnitFactory';
import { accountLockedSlot, designCost, isMechUnitId, parseMechId, isValidDesign, lockedSlot, mechDefinition } from '@entities/mechDesign';
import { findUnitDefinition } from '@entities/unitDefinitions';
import { addGold, trySpendGold } from '@state/economyOps';
import type { MatchState, SideState } from '@state/GameState';
import { laneDir, otherSide, SIDES, type Side } from '@state/types';
import { dealSplashDamage, drainUnit, repairBase, retireUnit } from '@systems/damageOps';
import type { SpawnPointCheck } from '@systems/SpawnSystem';
import { shotLine } from '@systems/shotLine';
import { applyModifier, clearSideModifier, grantShield, setSideModifier, stunUnit } from '@systems/statusOps';
import { emit, Events, on, type EventPayloads } from '@utils/EventBus';

/** Why a Mech can't be built right now. */
export type MechRejection =
  | 'not-playing'
  | 'player-only'
  | 'invalid'
  | 'account-locked'
  | 'locked'
  | 'titan-unavailable'
  | 'building'
  | 'alive'
  | 'cannot-afford';

/** Why the Mech's module can't be used right now. */
export type MechAbilityRejection = 'not-playing' | 'no-mech' | 'no-module' | 'cooling-down' | 'airborne';

/** What a design costs a side now (its age; Conquest traits can change it). */
export function mechPrice(side: SideState, design: MechDesign, titan = false): number {
  return Math.round((mechDefinition(design, side.age, titan).cost * side.traits.mechCost) / 5) * 5;
}

/** How long a design takes a side to build, ms. */
export function mechBuildMs(side: SideState, design: MechDesign, titan = false): number {
  return Math.round(mechDefinition(design, side.age, titan).trainTimeMs * side.traits.mechBuildTime);
}

/** Whether a side may build its Titan now (feature on, the final age, not built yet this match). */
export function titanOpen(side: SideState): boolean {
  return feature('titan') && side.age >= AGE_COUNT - 1 && !side.mech.titanBuilt;
}

/** The Forge level the side's parts count as (Conquest's Blueprints lower their needs). */
export function mechForgeLevel(side: SideState): number {
  return side.buildings.forge + side.traits.mechForgeBonus;
}

/**
 * Why `side` can't build `design` now, or null if it can. Shared by the
 * system and the hangar (which greys its Build button with it).
 */
export function mechRejection(state: MatchState, side: Side, design: MechDesign, titan = false): MechRejection | null {
  if (state.phase !== 'playing') return 'not-playing';
  if (!(MECH.sides as readonly Side[]).includes(side)) return 'player-only';
  if (!isValidDesign(design)) return 'invalid';
  const me = state[side];
  if (accountLockedSlot(design, me.mechLocked) !== null) return 'account-locked';
  if (lockedSlot(design, mechForgeLevel(me)) !== null) return 'locked';
  if (titan && !titanOpen(me)) return 'titan-unavailable';
  if (me.mech.build) return 'building';
  if (me.mech.alive) return 'alive';
  if (me.gold < mechPrice(me, design, titan)) return 'cannot-afford';
  return null;
}

/** Stuns a side's turrets near x until a time; returns their positions (x, y pairs). */
export type TurretStun = (side: Side, x: number, range: number, untilMs: number) => number[];

/** How long a leap is in the air, sim ms. */
const LEAP_MS = 650;
/** Jump legs leap only over a front line at least this close, px (edge to edge). */
const LEAP_TRIGGER_GAP = 40;
/** How far past the enemy front a jump-legs leap lands, px. */
const LEAP_PAST = 70;
/** Leaps land at least this far short of the enemy base's front, px. */
const LEAP_BASE_MARGIN = 20;
/** How long the carried troops stand apart when dropped, px. */
const TROOP_SPACING = 18;
/** Cooldown events are sent at most this often while a module recharges, sim ms. */
const ABILITY_ANNOUNCE_MS = 200;
const ABILITY_IDLE_ANNOUNCE_MS = 500;
/** A utility Mech's time left is announced this often, sim ms. */
const ASSIST_ANNOUNCE_MS = 500;
/** Cover and regen (combo and set bonuses) refresh this often, sim ms. */
const SUPPORT_TICK_MS = 250;
/** The Command set's HP bonus on the side's other units. */
const ALLY_HP_ID = 'mech-command-hp';

/**
 * The Mech workshop (owner, 2026-09-27; data in `config/mech.config.ts`).
 * A build request is paid up front and starts the build: the design in the
 * side's current age, for its build time, beside the unit queue (not in
 * it). When done, the Mech appears at the spawn point as soon as that is
 * clear, built by `UnitFactory` like any unit. One Mech per side at a time,
 * building or alive; only the player builds them (the AI never asks).
 *
 * In battle it runs what the Mech's parts do beyond stats and weapons (the
 * definition's `mech` block, Mech expansion): jump legs leap over the enemy
 * front line; the Hangar bay launches drones; the Overcharge core burns the
 * Mech's own HP; the Troop carrier drops melee troops when the Mech first
 * stops to fight or falls; the Salvage scanner pays extra kill gold near
 * it. It evolves into the side's new age after an age-up
 * (`MECH.evolveShare` of the price difference). And the Special module: `mech-ability-requested` is checked here and
 * the ability fired (smoke, overdrive, leap, overload, dome, EMP, orbital).
 *
 * A utility Mech (enough utility parts) doesn't fight: it walks back to a
 * building (clicked, or picked by priority), works there off the lane
 * where nothing can hit it, and powers down when its life runs out
 * (`MECH_UTILITY`; `runUtility`).
 *
 * Listens for: `build-mech-requested`, `mech-ability-requested`,
 * `mech-assist-requested`, `unit-died` (its Mech fell; salvage).
 * Emits: `mech-changed` (build start, every frame while building, spawn,
 * fall), `mech-ability-changed`, `mech-ability-used`, `mech-evolved`,
 * `mech-assist-changed`, `grant-building-level-requested`, `weapon-fx`,
 * `unit-spawned`; `gold-changed` through economyOps; damage, repair and
 * status events through damageOps / statusOps.
 */
export class MechSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly isSpawnPointClear: SpawnPointCheck;
  private readonly bases: Record<Side, Base>;
  private readonly projectiles: ProjectileFactory;
  private readonly stunTurrets: TurretStun;
  private readonly cleanups: (() => void)[];
  private nowMs = 0;
  /** When each side's module cooldown was last announced (sim ms). */
  private announcedAt: Record<Side, number> = { player: -Infinity, enemy: -Infinity };
  /** The module each side last announced (null: none out). */
  private announcedModule: Record<Side, string | null> = { player: null, enemy: null };
  private announcedRemaining: Record<Side, number> = { player: 0, enemy: 0 };
  /** Next cover / regen refresh (sim ms). */
  private supportTickAt = 0;
  /** When each side's utility Mech last announced its work (sim ms). */
  private assistAnnouncedAt: Record<Side, number> = { player: -Infinity, enemy: -Infinity };
  /** Sides whose Command-set HP bonus is on. */
  private allyHpOn: Record<Side, boolean> = { player: false, enemy: false };

  constructor(
    state: MatchState,
    units: UnitFactory,
    isSpawnPointClear: SpawnPointCheck,
    world: { bases: Record<Side, Base>; projectiles: ProjectileFactory; stunTurrets: TurretStun },
  ) {
    this.state = state;
    this.units = units;
    this.isSpawnPointClear = isSpawnPointClear;
    this.bases = world.bases;
    this.projectiles = world.projectiles;
    this.stunTurrets = world.stunTurrets;
    this.cleanups = [
      on(Events.BuildMechRequested, (payload) => this.onBuildRequested(payload)),
      on(Events.MechAbilityRequested, ({ side }) => this.onAbilityRequested(side)),
      on(Events.MechAssistRequested, ({ side, buildingId }) => this.onAssistRequested(side, buildingId)),
      on(Events.UnitDied, (payload) => this.onUnitDied(payload)),
    ];
  }

  /** `deltaMs` and `nowMs` are simulation time; call only while the match is playing. */
  update(deltaMs: number, nowMs: number): void {
    this.nowMs = nowMs;
    for (const side of SIDES) {
      const mech = this.state[side].mech;
      const build = mech.build;
      if (!build) continue;
      build.remainingMs = Math.max(0, build.remainingMs - deltaMs);
      if (build.remainingMs === 0 && this.isSpawnPointClear(build.unitId, side)) {
        const unit = this.units.create(build.unitId, side);
        mech.build = null;
        mech.alive = true;
        mech.abilityReadyAt = nowMs;
        emit(Events.UnitSpawned, { side, unitId: build.unitId, instanceId: unit.instanceId });
      }
      this.announce(side);
    }
    const supportTick = nowMs >= this.supportTickAt;
    if (supportTick) this.supportTickAt = nowMs + SUPPORT_TICK_MS;
    const allyHp: Record<Side, number | undefined> = { player: undefined, enemy: undefined };
    for (const unit of this.units.activeUnits) {
      if (!unit.isAlive || !unit.definition.mech) continue;
      this.runParts(unit, deltaMs, nowMs);
      if (supportTick) this.support(unit);
      if (unit.definition.mech.allyHp) allyHp[unit.side] = unit.definition.mech.allyHp;
    }
    for (const side of SIDES) this.setAllyHp(side, allyHp[side]);
    for (const side of SIDES) this.evolve(side);
    for (const side of SIDES) this.announceAbility(side, false);
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  /** Why `side` can't use its Mech's module now, or null. */
  abilityRejection(side: Side): MechAbilityRejection | null {
    if (this.state.phase !== 'playing') return 'not-playing';
    const unit = this.mechOf(side);
    if (!unit) return 'no-mech';
    if (!unit.definition.mech?.ability) return 'no-module';
    if (unit.airborne) return 'airborne';
    if (this.nowMs < (this.state[side].mech.abilityReadyAt ?? 0)) return 'cooling-down';
    return null;
  }

  /* ---- Building ------------------------------------------------------------------------------ */

  private onBuildRequested({ side, design, titan = false }: EventPayloads[typeof Events.BuildMechRequested]): void {
    if (mechRejection(this.state, side, design, titan) !== null) return;
    const me = this.state[side];
    const definition = mechDefinition(design, me.age, titan);
    if (!trySpendGold(this.state, side, mechPrice(me, design, titan), 'purchase')) return;
    if (titan) me.mech.titanBuilt = true;
    const buildMs = mechBuildMs(me, design, titan);
    me.mech.build = { unitId: definition.id, remainingMs: buildMs, totalMs: buildMs };
    this.announce(side);
  }

  private announce(side: Side): void {
    const { alive, build } = this.state[side].mech;
    emit(Events.MechChanged, { side, alive, build: build ? { ...build } : null });
  }

  private onUnitDied({ side, unitId, instanceId, killerSide, x }: EventPayloads[typeof Events.UnitDied]): void {
    if (isMechUnitId(unitId)) {
      this.state[side].mech.alive = false;
      if (this.state[side].mech.assist) {
        this.state[side].mech.assist = null;
        this.announceAssist(side, null, true);
      }
      const unit = this.units.findByInstanceId(instanceId);
      // A carrier that never stopped drops its troops where it fell.
      if (unit?.definition.mech?.troops && !unit.troopsDropped) this.dropTroops(unit, x);
      this.announce(side);
      this.announceAbility(side, true);
      return;
    }
    // Salvage scanner and the Scrapper set: kills near the killer's Mech pay extra.
    const mech = this.mechOf(killerSide);
    if (!mech) return;
    const parts = mech.definition.mech;
    let mult = 0;
    for (const bonus of [parts?.salvage, parts?.killGold]) {
      if (bonus && Math.abs(mech.x - x) <= bonus.radius) mult += bonus.goldMult;
    }
    const extra = Math.round((findUnitDefinition(unitId)?.killGold ?? 0) * mult);
    if (extra > 0) addGold(this.state, killerSide, extra, 'salvage');
  }

  /* ---- Parts --------------------------------------------------------------------------------- */

  private runParts(unit: Unit, deltaMs: number, nowMs: number): void {
    const parts = unit.definition.mech!;
    if (parts.utility) {
      this.runUtility(unit, parts.utility, deltaMs, nowMs);
      return;
    }
    if (unit.leap) {
      this.flyLeap(unit, nowMs);
      return;
    }
    if (parts.drain) {
      const max = unit.getStat('maxHp');
      drainUnit(unit, (max * parts.drain.perSec * deltaMs) / 1000, max * parts.drain.floor);
    }
    if (parts.troops && !unit.troopsDropped && unit.unitState === UnitState.Attacking) this.dropTroops(unit, unit.x);
    if (parts.leap && nowMs >= unit.leapReadyAt && unit.unitState === UnitState.Attacking) {
      const front = this.enemyFront(unit);
      if (front && this.gap(unit, front) <= LEAP_TRIGGER_GAP) {
        const to = front.x + laneDir(unit.side) * (front.halfWidth + unit.halfWidth + LEAP_PAST);
        if (this.startLeap(unit, to, parts.leap.damage, parts.leap.radius)) unit.leapReadyAt = nowMs + parts.leap.cooldownMs;
      }
    }
    if (parts.drones && nowMs >= unit.droneReadyAt) this.launchDrone(unit, parts.drones);
    if (parts.salvo && nowMs >= unit.salvoReadyAt) this.salvo(unit, parts.salvo);
    if (parts.regen) {
      for (const ally of this.alliesWithin(unit, parts.regen.radius)) {
        ally.heal((ally.getStat('maxHp') * parts.regen.perSec * deltaMs) / 1000);
      }
    }
  }

  /**
   * Evolve on age-up: a Mech older than its side's age takes the new age
   * (look, HP and damage; the same design) for `MECH.evolveShare` of the
   * price difference, as soon as the side can pay. Not while leaping.
   */
  private evolve(side: Side): void {
    const me = this.state[side];
    const unit = this.mechOf(side);
    if (!unit || unit.airborne || unit.definition.age >= me.age) return;
    const parsed = parseMechId(unit.definition.id);
    if (!parsed) return;
    const cost = this.evolveCost(side, parsed.design, parsed.age);
    if (me.gold < cost || (cost > 0 && !trySpendGold(this.state, side, cost, 'purchase'))) return;
    const fromAge = unit.definition.age;
    unit.setDefinition(mechDefinition(parsed.design, me.age));
    emit(Events.MechEvolved, { side, instanceId: unit.instanceId, x: unit.x, topY: unit.topY, fromAge, toAge: me.age, cost });
  }

  /** Gold for a side's Mech of `design`, built in `fromAge`, to take the side's age now. */
  evolveCost(side: Side, design: MechDesign, fromAge: number): number {
    const me = this.state[side];
    const diff = designCost(design, me.age) - designCost(design, fromAge);
    return Math.max(0, Math.round((diff * MECH.evolveShare * me.traits.mechCost) / 5) * 5);
  }

  /* ---- The utility Mech (Mech expansion section 7) ------------------------------------------- */

  /**
   * A utility Mech walks back to its building (off the lane: nothing targets
   * it), works there until its life runs out, then powers down. While it
   * works, `MechState.assist` tells BuildingSystem what it does to that
   * building; the Wrench arm repairs the base and the Workshop core crafts
   * free levels here.
   */
  private runUtility(unit: Unit, u: NonNullable<NonNullable<Unit['definition']['mech']>['utility']>, deltaMs: number, nowMs: number): void {
    const side = unit.side;
    const mech = this.state[side].mech;
    if (!unit.offLane) {
      // Just out of the gate: its life starts, and it heads for a building.
      unit.offLane = true;
      unit.workUntil = nowMs + u.lifetimeMs;
      const wanted = mech.assist?.buildingId;
      mech.assist = { buildingId: wanted && this.isAssistable(wanted) ? wanted : this.autoBuilding(side), working: false, output: u.output, discount: u.discount };
      this.announceAssist(side, unit, true);
    }
    const assist = mech.assist!;
    if (nowMs >= unit.workUntil) {
      mech.assist = null;
      retireUnit(unit);
      this.announceAssist(side, null, true);
      return;
    }
    const targetX = this.buildingPosition(side, assist.buildingId as BuildingId);
    const gap = targetX - unit.x;
    if (Math.abs(gap) > 2) {
      if (assist.working) {
        assist.working = false;
        this.announceAssist(side, unit, true);
      }
      const step = Math.min(Math.abs(gap), (unit.getStat('speed') * MECH_UTILITY.walkMult * deltaMs) / 1000);
      unit.x += Math.sign(gap) * step;
      unit.unitState = UnitState.Walking;
      // Face the way it walks (its art faces the lane).
      unit.setFlipX((side === 'player') === gap < 0);
      this.announceAssist(side, unit, false);
      return;
    }
    unit.unitState = UnitState.Idle;
    unit.setFlipX(side === 'enemy');
    if (!assist.working) {
      assist.working = true;
      this.announceAssist(side, unit, true);
    }
    if (nowMs >= unit.workAnimAt) {
      unit.workAnimAt = nowMs + MECH_UTILITY.workAnimMs;
      unit.playAttack();
    }
    if (u.repairPerSec > 0) {
      const base = this.bases[side];
      repairBase(base, (base.maxHp * u.repairPerSec * deltaMs) / 1000);
    }
    if (u.craftEveryMs) {
      unit.craftMs += deltaMs;
      if (unit.craftMs >= u.craftEveryMs) {
        unit.craftMs -= u.craftEveryMs;
        emit(Events.GrantBuildingLevelRequested, { side, buildingId: assist.buildingId as BuildingId });
      }
    }
    this.announceAssist(side, unit, false);
  }

  /** Clicking a building sends the utility Mech there (switching mid-life is fine). */
  private onAssistRequested(side: Side, buildingId: BuildingId): void {
    const mech = this.state[side].mech;
    if (this.state.phase !== 'playing' || !this.isAssistable(buildingId) || !mech.assist) return;
    const unit = this.mechOf(side);
    if (!unit?.definition.mech?.utility || mech.assist.buildingId === buildingId) return;
    mech.assist = { ...mech.assist, buildingId, working: false };
    unit.craftMs = 0;
    this.announceAssist(side, unit, true);
  }

  private isAssistable(id: string): boolean {
    return (activeBuildingIds() as readonly string[]).includes(id);
  }

  /** The building a utility Mech goes to by itself: the first built one in priority order, else the first there is. */
  private autoBuilding(side: Side): BuildingId {
    const me = this.state[side];
    const ids = MECH_UTILITY.priority.filter((id) => this.isAssistable(id)) as BuildingId[];
    return ids.find((id) => me.buildings[id] > 0) ?? ids[0] ?? 'mine';
  }

  private buildingPosition(side: Side, id: BuildingId): number {
    return buildingX(side, BASE_X[side], Math.max(0, activeBuildingIds().indexOf(id)));
  }

  /** `mech-assist-changed` when something changes, and twice a second for the time left. */
  private announceAssist(side: Side, unit: Unit | null, force: boolean): void {
    if (!force && this.nowMs - this.assistAnnouncedAt[side] < ASSIST_ANNOUNCE_MS) return;
    this.assistAnnouncedAt[side] = this.nowMs;
    const assist = this.state[side].mech.assist;
    emit(Events.MechAssistChanged, {
      side,
      buildingId: (assist?.buildingId as BuildingId | undefined) ?? null,
      working: assist?.working ?? false,
      remainingMs: unit ? Math.max(0, unit.workUntil - this.nowMs) : 0,
    });
  }

  /** Bulwark: allies just behind the Mech take less damage (refreshed a few times a second). */
  private support(unit: Unit): void {
    const cover = unit.definition.mech?.cover;
    if (!cover) return;
    const dir = laneDir(unit.side);
    for (const ally of this.units.activeUnits) {
      if (ally === unit || ally.side !== unit.side || !ally.isAlive) continue;
      const behind = (unit.x - ally.x) * dir - unit.halfWidth - ally.halfWidth;
      if (behind < -ally.halfWidth || behind > cover.range) continue;
      applyModifier(ally, { id: 'mech-cover', source: 'mech', stat: 'damageTaken', mult: cover.mult, expiresAt: this.nowMs + SUPPORT_TICK_MS * 2 });
    }
  }

  /** Arsenal set: a gun arm fires a quick extra salvo at what it can reach. */
  private salvo(unit: Unit, salvo: { everyMs: number; shots: number }): void {
    const gun = [unit.definition.attack, unit.definition.secondaryAttack].find((a) => a?.projectileKey);
    if (!gun?.projectileKey) return;
    const reach = gun.range * unit.statMultiplier('range');
    const target = this.nearestEnemy(unit, reach);
    if (!target) return;
    unit.salvoReadyAt = this.nowMs + salvo.everyMs;
    const line = shotLine(this.units.activeUnits, this.bases[otherSide(unit.side)], unit, gun.muzzle, reach);
    const damage = gun.damage * unit.statMultiplier('damage');
    for (let i = 0; i < salvo.shots; i++) {
      const p = this.projectiles.launch(gun.projectileKey, unit.side, line.x0, line.y0 + (i - 1) * 4, damage, gun.splashRadius ?? 0);
      p.aimAt(line.x1, line.y1 + (i - 1) * 6, true);
      p.sourceSlot = unit.definition.slot;
    }
    emit(Events.WeaponFx, { side: unit.side, kind: 'drone', x: line.x0, y: line.y0 });
  }

  /** Command set: the side's other units get more max HP while the Mech is out. */
  private setAllyHp(side: Side, mult: number | undefined): void {
    if (mult !== undefined && !this.allyHpOn[side]) {
      setSideModifier(this.state, this.units.activeUnits, side, { id: ALLY_HP_ID, source: 'mech', stat: 'maxHp', mult, mech: 'exclude' });
      this.allyHpOn[side] = true;
    } else if (mult === undefined && this.allyHpOn[side]) {
      clearSideModifier(this.state, this.units.activeUnits, side, ALLY_HP_ID);
      this.allyHpOn[side] = false;
    }
  }

  private launchDrone(unit: Unit, drones: NonNullable<NonNullable<Unit['definition']['mech']>['drones']>): void {
    const target = this.nearestEnemy(unit, drones.range);
    if (!target) return;
    unit.droneReadyAt = this.nowMs + drones.cooldownMs;
    const x0 = unit.x - laneDir(unit.side) * 6;
    const y0 = unit.topY - 6;
    const damage = drones.damage * unit.statMultiplier('damage');
    this.projectiles.launch(drones.projectileKey, unit.side, x0, y0, damage, drones.radius).aimAt(target.x, target.centerY, false);
    emit(Events.WeaponFx, { side: unit.side, kind: 'drone', x: x0, y: y0, points: [x0, y0, target.x, target.centerY] });
  }

  private dropTroops(unit: Unit, x: number): void {
    const troops = unit.definition.mech?.troops;
    unit.troopsDropped = true;
    if (!troops) return;
    const dir = laneDir(unit.side);
    for (let i = 0; i < troops.count; i++) {
      const troop = this.units.create(troops.unitId, unit.side);
      troop.x = this.clampX(troop, x - dir * (i * TROOP_SPACING - TROOP_SPACING));
      const buff = unit.definition.mech?.troopBuff;
      if (buff) applyModifier(troop, { id: 'mech-rally', source: 'mech', stat: 'damage', mult: buff.damage, expiresAt: this.nowMs + buff.ms });
      emit(Events.UnitSpawned, { side: unit.side, unitId: troops.unitId, instanceId: troop.instanceId });
    }
    emit(Events.WeaponFx, { side: unit.side, kind: 'troops', x, y: unit.centerY });
  }

  /** Starts a leap to `toX` (kept short of the enemy base). False if there is no room to go forward. */
  private startLeap(unit: Unit, toX: number, damage: number, radius: number): boolean {
    const dir = laneDir(unit.side);
    const enemyFront = this.bases[otherSide(unit.side)].frontX;
    const limit = enemyFront - dir * (unit.halfWidth + LEAP_BASE_MARGIN);
    const to = dir > 0 ? Math.min(toX, limit) : Math.max(toX, limit);
    if ((to - unit.x) * dir < 10) return false;
    unit.leap = { fromX: unit.x, toX: to, start: this.nowMs, end: this.nowMs + LEAP_MS, damage, radius };
    unit.strikeAt = 0;
    emit(Events.WeaponFx, { side: unit.side, kind: 'leap', x: unit.x, y: unit.y, points: [unit.x, unit.y, to, unit.y] });
    return true;
  }

  /** Moves a leaping unit along its arc; on landing, splash around it. */
  private flyLeap(unit: Unit, nowMs: number): void {
    const leap = unit.leap!;
    const k = Math.min(1, (nowMs - leap.start) / (leap.end - leap.start));
    unit.x = leap.fromX + (leap.toX - leap.fromX) * k;
    unit.y = LANE_Y - Math.sin(k * Math.PI) * 70;
    if (k < 1) return;
    unit.leap = null;
    unit.y = LANE_Y;
    const base = this.bases[otherSide(unit.side)];
    dealSplashDamage(this.units.activeUnits, unit.x, leap.radius, leap.damage * unit.statMultiplier('damage'), unit.side, null, base);
    emit(Events.WeaponFx, { side: unit.side, kind: 'land', x: unit.x, y: unit.y, radius: leap.radius });
  }

  /* ---- The Special module -------------------------------------------------------------------- */

  private onAbilityRequested(side: Side): void {
    if (this.abilityRejection(side) !== null) return;
    const unit = this.mechOf(side)!;
    const { ability } = unit.definition.mech!.ability!;
    if (!this.fire(unit, ability)) return;
    this.state[side].mech.abilityReadyAt = this.nowMs + ability.cooldownMs;
    this.announceAbility(side, true);
  }

  /** Fires an ability. False when it had nothing to do (the cooldown isn't spent). */
  private fire(unit: Unit, ability: MechAbility): boolean {
    const side = unit.side;
    const dir = laneDir(side);
    const moduleId = unit.definition.mech!.ability!.moduleId;
    const used = (x: number, radius: number, toX?: number): void =>
      emit(Events.MechAbilityUsed, { side, moduleId, kind: ability.kind, x, radius, ...(toX !== undefined ? { toX } : {}) });
    const damageMult = unit.statMultiplier('damage');
    switch (ability.kind) {
      case 'smoke': {
        const x = unit.x + dir * (unit.halfWidth + ability.radius * 0.5);
        for (const enemy of this.enemiesWithin(x, ability.radius, side)) {
          if (!enemy.definition.attack?.projectileKey) continue;
          applyModifier(enemy, { id: 'mech-smoke', source: 'mech', stat: 'damage', mult: ability.damageMult, expiresAt: this.nowMs + ability.durationMs, hostile: true });
        }
        used(x, ability.radius);
        return true;
      }
      case 'overdrive':
        applyModifier(unit, { id: 'mech-overdrive', source: 'mech', stat: 'attackCooldown', mult: ability.cooldownMult, expiresAt: this.nowMs + ability.durationMs });
        unit.attackReadyAt = Math.min(unit.attackReadyAt, this.nowMs);
        used(unit.x, 40);
        return true;
      case 'leap':
        if (!this.startLeap(unit, unit.x + dir * ability.distance, ability.damage, ability.radius)) return false;
        used(unit.x, ability.radius, unit.leap!.toX);
        return true;
      case 'overload': {
        const base = this.bases[otherSide(side)];
        dealSplashDamage(this.units.activeUnits, unit.x, ability.radius, ability.damage * damageMult, side, null, base);
        drainUnit(unit, unit.getStat('maxHp') * ability.hpCost, 1);
        used(unit.x, ability.radius);
        return true;
      }
      case 'dome':
        for (const ally of this.units.activeUnits) {
          if (ally.side !== side || !ally.isAlive || Math.abs(ally.x - unit.x) - ally.halfWidth > ability.radius) continue;
          grantShield(ally, ally === unit ? ability.shield : ability.shield * 0.5);
        }
        used(unit.x, ability.radius);
        return true;
      case 'emp': {
        const until = this.nowMs + ability.stunMs;
        const points: number[] = [];
        for (const enemy of this.enemiesWithin(unit.x, ability.range, side)) {
          if (enemy.definition.slot !== 3) continue;
          stunUnit(enemy, ability.stunMs, this.nowMs);
          points.push(enemy.x, enemy.centerY);
        }
        points.push(...this.stunTurrets(otherSide(side), unit.x, ability.range, until));
        if (points.length) emit(Events.WeaponFx, { side, kind: 'stun', x: unit.x, y: unit.centerY, points });
        used(unit.x, ability.range);
        return true;
      }
      case 'orbital': {
        const target = this.enemyFront(unit, Infinity);
        if (!target) return false;
        const base = this.bases[otherSide(side)];
        dealSplashDamage(this.units.activeUnits, target.x, ability.radius, ability.damage * damageMult, side, null, base);
        used(target.x, ability.radius, target.x);
        return true;
      }
      case 'rush': {
        // Only while a utility Mech is at work: its building levels up now.
        const assist = this.state[side].mech.assist;
        if (!assist?.working) return false;
        emit(Events.GrantBuildingLevelRequested, { side, buildingId: assist.buildingId as BuildingId });
        used(unit.x, 40);
        return true;
      }
    }
  }

  /**
   * `mech-ability-changed` when the module shown changes, a few times a
   * second while it recharges, and once a second otherwise (so a HUD that
   * was rebuilt catches up).
   */
  private announceAbility(side: Side, force: boolean): void {
    const unit = this.mechOf(side);
    const ability = unit?.definition.mech?.ability ?? null;
    const moduleId = ability?.moduleId ?? null;
    const remainingMs = ability ? Math.max(0, (this.state[side].mech.abilityReadyAt ?? 0) - this.nowMs) : 0;
    const every = remainingMs > 0 ? ABILITY_ANNOUNCE_MS : ABILITY_IDLE_ANNOUNCE_MS;
    const justReady = remainingMs === 0 && this.announcedRemaining[side] > 0;
    if (!force && !justReady && moduleId === this.announcedModule[side] && this.nowMs - this.announcedAt[side] < every) return;
    this.announcedModule[side] = moduleId;
    this.announcedRemaining[side] = remainingMs;
    this.announcedAt[side] = this.nowMs;
    emit(Events.MechAbilityChanged, { side, moduleId, remainingMs, totalMs: ability?.ability.cooldownMs ?? 1 });
  }

  /* ---- Helpers ------------------------------------------------------------------------------- */

  /** The side's Mech on the lane, if any. */
  private mechOf(side: Side): Unit | null {
    if (!this.state[side].mech.alive) return null;
    for (const unit of this.units.activeUnits) {
      if (unit.side === side && unit.isAlive && isMechUnitId(unit.definition.id)) return unit;
    }
    return null;
  }

  /** Edge-to-edge gap between two units. */
  private gap(a: Unit, b: Unit): number {
    return Math.abs(a.x - b.x) - a.halfWidth - b.halfWidth;
  }

  /** The nearest enemy ahead of `unit` within `reach` (edge to edge). */
  private nearestEnemy(unit: Unit, reach: number): Unit | null {
    return this.enemyFront(unit, reach);
  }

  /** The enemy unit furthest forward toward `unit`'s side (its front line), within `reach` of it. */
  private enemyFront(unit: Unit, reach = Infinity): Unit | null {
    const dir = laneDir(unit.side);
    let best: Unit | null = null;
    let bestAhead = Infinity;
    for (const other of this.units.activeUnits) {
      if (other.side === unit.side || !other.onLane || other.airborne) continue;
      const ahead = (other.x - unit.x) * dir;
      if (ahead < -unit.halfWidth || this.gap(unit, other) > reach) continue;
      if (ahead < bestAhead) {
        best = other;
        bestAhead = ahead;
      }
    }
    return best;
  }

  private *alliesWithin(unit: Unit, radius: number): Generator<Unit> {
    for (const other of this.units.activeUnits) {
      if (other.side === unit.side && other.isAlive && Math.abs(other.x - unit.x) - other.halfWidth <= radius) yield other;
    }
  }

  private *enemiesWithin(x: number, radius: number, side: Side): Generator<Unit> {
    for (const other of this.units.activeUnits) {
      if (other.side !== side && other.onLane && Math.abs(other.x - x) - other.halfWidth <= radius) yield other;
    }
  }

  private clampX(unit: Unit, x: number): number {
    return Math.max(this.bases.player.frontX + unit.halfWidth, Math.min(this.bases.enemy.frontX - unit.halfWidth, x));
  }
}
