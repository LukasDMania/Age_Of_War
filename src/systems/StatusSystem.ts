import type { UnitFactory } from '@entities/UnitFactory';
import type { MatchState } from '@state/GameState';
import { dealUnitDamage } from '@systems/damageOps';
import { applyModifier, removeModifier, sideModifierApplies, toUnitModifier } from '@systems/statusOps';

/** Burns deal their damage in ticks this far apart (one damage number each). */
const BURN_TICK_MS = 500;
import { Events, on } from '@utils/EventBus';

/**
 * Keeps stat modifiers up to date (Phase 7). Modifiers themselves are added
 * and removed through `statusOps` by whoever causes them; this system:
 *
 * - removes timed modifiers when their `expiresAt` (simulation time) passes;
 * - puts each side-wide modifier (`SideState.modifiers`) on units as they
 *   spawn, so a penalty or aura set earlier also covers new units;
 * - ticks burns (`statusOps.applyBurn`, a Mech's flamethrower) every
 *   `BURN_TICK_MS` through damageOps.
 *
 * Listens for: `unit-spawned`.
 * Emits (through statusOps): `modifier-applied`, `modifier-removed`;
 * (through damageOps) `unit-damaged` for burns.
 */
export class StatusSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly unsubscribe: () => void;
  private lastNow = 0;

  constructor(state: MatchState, units: UnitFactory) {
    this.state = state;
    this.units = units;
    this.unsubscribe = on(Events.UnitSpawned, ({ side, instanceId }) => {
      const unit = this.units.findByInstanceId(instanceId);
      if (!unit) return;
      for (const modifier of this.state[side].modifiers) {
        if (sideModifierApplies(modifier, unit)) applyModifier(unit, toUnitModifier(modifier));
      }
    });
  }

  /** `nowMs` is the simulation clock. */
  update(nowMs: number): void {
    const burnTick = Math.floor(nowMs / BURN_TICK_MS) > Math.floor(this.lastNow / BURN_TICK_MS);
    this.lastNow = nowMs;
    for (const unit of this.units.activeUnits) {
      if (!unit.isAlive) continue;
      if (unit.burnUntil > 0) {
        if (nowMs >= unit.burnUntil) unit.burnUntil = 0;
        else if (burnTick) dealUnitDamage(unit, (unit.burnDps * BURN_TICK_MS) / 1000, unit.burnSide);
        if (!unit.isAlive) continue;
      }
      // Backwards, since removing shifts the rest of the list.
      for (let i = unit.modifiers.length - 1; i >= 0; i--) {
        const modifier = unit.modifiers[i];
        if (modifier?.expiresAt !== undefined && modifier.expiresAt <= nowMs) {
          removeModifier(unit, modifier.id);
        }
      }
    }
  }

  destroy(): void {
    this.unsubscribe();
  }
}
