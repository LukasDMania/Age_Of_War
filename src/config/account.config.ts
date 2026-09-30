import type { MechAchievementId } from '@config/mech.config';

/**
 * The account level (Mech expansion section 5): kept per browser, it grows
 * with every finished match and opens Mech parts across games, so nobody
 * builds the wild parts in game 1. All numbers PROPOSED.
 *
 * Account XP per finished match:
 * - `win`, or `loss` (a loss that lasted `longLossMs` gets `longLoss`);
 * - `perKills` for every `killsPer` enemy units killed;
 * - `conquestWin` more for a won Conquest battle.
 */
export const ACCOUNT_XP = {
  win: 100,
  loss: 20,
  longLoss: 50,
  longLossMs: 8 * 60_000,
  killsPer: 10,
  perKills: 5,
  conquestWin: 40,
} as const;

/** Account XP needed to go from `level` to `level + 1` (level 1 is the start). */
export function xpForLevel(level: number): number {
  return 150 + 50 * (level - 1);
}

/** What an achievement asks and how far it is (its counter reaching `target`). */
export interface AchievementInfo {
  name: string;
  /** Shown on a locked part in the hangar. */
  about: string;
  target: number;
  /** Counted over one match or one Mech life (best kept), or summed over all games. */
  scope: 'best' | 'total';
}

export const MECH_ACHIEVEMENTS: Readonly<Record<MechAchievementId, AchievementInfo>> = {
  'twin-guns-win': { name: 'Twin guns', about: 'Win a match after building a Mech with two gun arms', target: 1, scope: 'total' },
  'launcher-siege': { name: 'Siege gunner', about: 'Win a match with a Launcher Mech on the lane', target: 1, scope: 'total' },
  'mech-rampage': { name: 'Rampage', about: 'Enemies falling near one Mech in one life', target: 10, scope: 'best' },
  'mech-absorb': { name: 'Iron wall', about: 'Damage your Mechs take in one match (Stone-age scale)', target: 5000, scope: 'best' },
  'mech-hunter': { name: 'Hunter', about: 'Enemy ranged units falling at your Mech (all games)', target: 50, scope: 'total' },
  'big-army': { name: 'Big army', about: 'Units alive at once', target: 20, scope: 'best' },
};
