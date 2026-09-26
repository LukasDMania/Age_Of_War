import type { Side } from '@state/types';
import { Events, on, type GoldSource } from '@utils/EventBus';

/** What one side did over a match, for the game-over panel. */
export interface SideStats {
  unitsTrained: number;
  kills: number;
  losses: number;
  goldEarned: number;
  goldSpent: number;
  turretsBuilt: number;
  specialsFired: number;
}

/** Gold that counts as earned: refunds and cheats don't. */
const EARNED_SOURCES: ReadonlySet<GoldSource> = new Set<GoldSource>(['kill', 'mine', 'economy-unit']);

function emptyStats(): SideStats {
  return { unitsTrained: 0, kills: 0, losses: 0, goldEarned: 0, goldSpent: 0, turretsBuilt: 0, specialsFired: 0 };
}

/**
 * Counts what each side did during a match (Phase 13). Listens only; it
 * never changes the match. Refunds and cheat gold don't count as earned.
 *
 * Listens for: `unit-spawned`, `unit-died`, `gold-changed`, `turret-built`,
 * `special-fired`.
 */
export class StatsSystem {
  private readonly stats: Record<Side, SideStats> = { player: emptyStats(), enemy: emptyStats() };
  private readonly cleanups: (() => void)[];

  constructor() {
    this.cleanups = [
      on(Events.UnitSpawned, ({ side }) => this.stats[side].unitsTrained++),
      on(Events.UnitDied, ({ side, killerSide }) => {
        this.stats[side].losses++;
        if (killerSide !== side) this.stats[killerSide].kills++;
      }),
      on(Events.GoldChanged, ({ side, delta, source }) => {
        if (delta > 0 && EARNED_SOURCES.has(source)) this.stats[side].goldEarned += delta;
        else if (delta < 0) this.stats[side].goldSpent -= delta;
      }),
      on(Events.TurretBuilt, ({ side }) => this.stats[side].turretsBuilt++),
      on(Events.SpecialFired, ({ side }) => this.stats[side].specialsFired++),
    ];
  }

  for(side: Side): SideStats {
    return { ...this.stats[side] };
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }
}
