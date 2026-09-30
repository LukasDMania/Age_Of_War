import { getAge } from '@config/ages.config';
import { MECH_ACHIEVEMENTS } from '@config/account.config';
import { MECH_ARMS, type MechAchievementId, type MechSlot } from '@config/mech.config';
import type { Unit } from '@entities/Unit';
import type { UnitFactory } from '@entities/UnitFactory';
import { isMechUnitId, parseMechId, partInfo } from '@entities/mechDesign';
import { findUnitDefinition } from '@entities/unitDefinitions';
import {
  accountLevel,
  loadAccount,
  lockedPartKeys,
  matchXp,
  saveAccount,
  type AccountProgress,
} from '@state/accountProgress';
import type { Side } from '@state/types';
import { Events, on } from '@utils/EventBus';

/** A kill counts for the Mech when the enemy falls this close to its weapons' reach, px. */
const NEAR_MECH = 40;
/** A ranged enemy falling this close to the Mech (edge to edge) counts as a melee kill for Hunter. */
const MELEE_GAP = 40;

/** What a finished match did for the account (the game-over panel shows it). */
export interface AccountResult {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  /** Names of the parts this match opened. */
  unlocked: string[];
  /** Achievements completed this match. */
  achieved: string[];
}

/**
 * Watches a match for the account (Mech expansion section 5): the
 * achievement counters (Mech kills in one life, damage its Mechs take,
 * ranged enemies falling at the Mech, units alive at once, the Mechs built)
 * and, when the match ends, the account XP. Writes the account only then
 * (`finish`). Only for matches a person plays: GameScene skips it in
 * headless runs and AI-vs-AI.
 *
 * Listens for: `unit-spawned`, `unit-died`, `unit-damaged`.
 */
export class AccountTracker {
  private readonly units: UnitFactory;
  private readonly side: Side;
  private readonly cleanups: (() => void)[];
  private alive = 0;
  private bestAlive = 0;
  private lifeKills = 0;
  private bestLifeKills = 0;
  private absorbed = 0;
  private rangedAtMech = 0;
  private twinGuns = false;
  private finished = false;

  constructor(units: UnitFactory, side: Side = 'player') {
    this.units = units;
    this.side = side;
    this.cleanups = [
      on(Events.UnitSpawned, ({ side: s, unitId }) => {
        if (s !== this.side) return;
        this.alive++;
        this.bestAlive = Math.max(this.bestAlive, this.alive);
        const parsed = parseMechId(unitId);
        if (parsed && MECH_ARMS[parsed.design.left].attack?.ranged && MECH_ARMS[parsed.design.right].attack?.ranged) this.twinGuns = true;
      }),
      on(Events.UnitDied, ({ side: s, unitId, x }) => {
        if (s === this.side) {
          this.alive = Math.max(0, this.alive - 1);
          if (isMechUnitId(unitId)) this.lifeKills = 0;
          return;
        }
        const mech = this.mech();
        if (!mech) return;
        const reach = Math.max(mech.definition.attack?.range ?? 0, mech.definition.secondaryAttack?.range ?? 0) + NEAR_MECH;
        const gap = Math.abs(x - mech.x) - mech.halfWidth;
        if (gap <= reach) {
          this.lifeKills++;
          this.bestLifeKills = Math.max(this.bestLifeKills, this.lifeKills);
        }
        if (gap <= MELEE_GAP && findUnitDefinition(unitId)?.slot === 2) this.rangedAtMech++;
      }),
      on(Events.UnitDamaged, ({ side: s, instanceId, amount, absorbed }) => {
        if (s !== this.side) return;
        const unit = this.units.findByInstanceId(instanceId);
        if (!unit || !isMechUnitId(unit.definition.id)) return;
        this.absorbed += (amount + absorbed) / getAge(unit.definition.age).scale;
      }),
    ];
  }

  /** Records the finished match in the account (once) and says what it earned. */
  finish(match: { won: boolean; durationMs: number; kills: number; conquest: boolean }): AccountResult | null {
    if (this.finished) return null;
    this.finished = true;
    const progress = loadAccount();
    const lockedBefore = new Set(lockedPartKeys(progress));
    const doneBefore = new Set((Object.keys(MECH_ACHIEVEMENTS) as MechAchievementId[]).filter((id) => this.done(progress, id)));
    const levelBefore = accountLevel(progress.xp).level;

    const best = (id: MechAchievementId, value: number): void => {
      progress.counters[id] = Math.max(progress.counters[id] ?? 0, value);
    };
    best('big-army', this.bestAlive);
    best('mech-rampage', this.bestLifeKills);
    best('mech-absorb', Math.round(this.absorbed));
    progress.counters['mech-hunter'] = (progress.counters['mech-hunter'] ?? 0) + this.rangedAtMech;
    if (match.won && this.twinGuns) best('twin-guns-win', 1);
    const mech = this.mech();
    const parsed = mech ? parseMechId(mech.definition.id) : null;
    if (match.won && parsed && (parsed.design.left === 'launcher' || parsed.design.right === 'launcher')) best('launcher-siege', 1);

    const xpGained = matchXp(match);
    progress.xp += xpGained;
    saveAccount(progress);

    const lockedAfter = new Set(lockedPartKeys(progress));
    const unlocked = [...lockedBefore]
      .filter((key) => !lockedAfter.has(key))
      .map((key) => {
        const [kind, id] = key.split(':') as [string, string];
        return partInfo(kind === 'arm' ? 'left' : (kind as MechSlot), id).name;
      });
    const achieved = (Object.keys(MECH_ACHIEVEMENTS) as MechAchievementId[])
      .filter((id) => !doneBefore.has(id) && this.done(progress, id))
      .map((id) => MECH_ACHIEVEMENTS[id].name);
    return { xpGained, levelBefore, levelAfter: accountLevel(progress.xp).level, unlocked, achieved };
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  private done(progress: AccountProgress, id: MechAchievementId): boolean {
    return (progress.counters[id] ?? 0) >= MECH_ACHIEVEMENTS[id].target;
  }

  private mech(): Unit | null {
    for (const unit of this.units.activeUnits) {
      if (unit.side === this.side && unit.isAlive && isMechUnitId(unit.definition.id)) return unit;
    }
    return null;
  }
}
