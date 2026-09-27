import { MECH, type MechDesign } from '@config/mech.config';
import type { UnitFactory } from '@entities/UnitFactory';
import { designCost, isMechUnitId, isValidDesign, lockedSlot, mechDefinition } from '@entities/mechDesign';
import { trySpendGold } from '@state/economyOps';
import type { MatchState, SideState } from '@state/GameState';
import { SIDES, type Side } from '@state/types';
import type { SpawnPointCheck } from '@systems/SpawnSystem';
import { emit, Events, on, type EventPayloads } from '@utils/EventBus';

/** Why a Mech can't be built right now. */
export type MechRejection = 'not-playing' | 'player-only' | 'invalid' | 'locked' | 'building' | 'alive' | 'cannot-afford';

/** What a design costs a side now (its age; Conquest traits can change it). */
export function mechPrice(side: SideState, design: MechDesign): number {
  return Math.round((designCost(design, side.age) * side.traits.mechCost) / 5) * 5;
}

/** How long a design takes a side to build, ms. */
export function mechBuildMs(side: SideState, design: MechDesign): number {
  return Math.round(mechDefinition(design, side.age).trainTimeMs * side.traits.mechBuildTime);
}

/** The Forge level the side's parts count as (Conquest's Blueprints lower their needs). */
export function mechForgeLevel(side: SideState): number {
  return side.buildings.forge + side.traits.mechForgeBonus;
}

/**
 * Why `side` can't build `design` now, or null if it can. Shared by the
 * system and the Workshop tab (which greys its Build button with it).
 */
export function mechRejection(state: MatchState, side: Side, design: MechDesign): MechRejection | null {
  if (state.phase !== 'playing') return 'not-playing';
  if (!(MECH.sides as readonly Side[]).includes(side)) return 'player-only';
  if (!isValidDesign(design)) return 'invalid';
  const me = state[side];
  if (lockedSlot(design, mechForgeLevel(me)) !== null) return 'locked';
  if (me.mech.build) return 'building';
  if (me.mech.alive) return 'alive';
  if (me.gold < mechPrice(me, design)) return 'cannot-afford';
  return null;
}

/**
 * The Mech workshop (owner, 2026-09-27; data in `config/mech.config.ts`).
 * A build request is paid up front and starts the build: the design in the
 * side's current age, for its build time, beside the unit queue (not in
 * it). When done, the Mech appears at the spawn point as soon as that is
 * clear, built by `UnitFactory` like any unit. One Mech per side at a time,
 * building or alive; only the player builds them (the AI never asks).
 *
 * Listens for: `build-mech-requested`, `unit-died` (its Mech fell).
 * Emits: `mech-changed` (build start, every frame while building, spawn,
 * fall), `unit-spawned`, and `gold-changed` through economyOps.
 */
export class MechSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly isSpawnPointClear: SpawnPointCheck;
  private readonly cleanups: (() => void)[];

  constructor(state: MatchState, units: UnitFactory, isSpawnPointClear: SpawnPointCheck) {
    this.state = state;
    this.units = units;
    this.isSpawnPointClear = isSpawnPointClear;
    this.cleanups = [
      on(Events.BuildMechRequested, (payload) => this.onBuildRequested(payload)),
      on(Events.UnitDied, ({ side, unitId }) => {
        if (!isMechUnitId(unitId)) return;
        this.state[side].mech.alive = false;
        this.announce(side);
      }),
    ];
  }

  /** `deltaMs` is simulation time; call only while the match is playing. */
  update(deltaMs: number): void {
    for (const side of SIDES) {
      const mech = this.state[side].mech;
      const build = mech.build;
      if (!build) continue;
      build.remainingMs = Math.max(0, build.remainingMs - deltaMs);
      if (build.remainingMs === 0 && this.isSpawnPointClear(build.unitId, side)) {
        const unit = this.units.create(build.unitId, side);
        mech.build = null;
        mech.alive = true;
        emit(Events.UnitSpawned, { side, unitId: build.unitId, instanceId: unit.instanceId });
      }
      this.announce(side);
    }
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  private onBuildRequested({ side, design }: EventPayloads[typeof Events.BuildMechRequested]): void {
    if (mechRejection(this.state, side, design) !== null) return;
    const me = this.state[side];
    const definition = mechDefinition(design, me.age);
    if (!trySpendGold(this.state, side, mechPrice(me, design), 'purchase')) return;
    const buildMs = mechBuildMs(me, design);
    me.mech.build = { unitId: definition.id, remainingMs: buildMs, totalMs: buildMs };
    this.announce(side);
  }

  private announce(side: Side): void {
    const { alive, build } = this.state[side].mech;
    emit(Events.MechChanged, { side, alive, build: build ? { ...build } : null });
  }
}
