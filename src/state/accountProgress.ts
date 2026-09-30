import { ACCOUNT_XP, MECH_ACHIEVEMENTS, xpForLevel } from '@config/account.config';
import {
  MECH_ARMS,
  MECH_HEADS,
  MECH_LEGS,
  MECH_MODULES,
  MECH_TORSOS,
  type MechAchievementId,
  type PartUnlock,
} from '@config/mech.config';

/**
 * The account's progress across games (Mech expansion section 5), kept
 * per browser like the blueprints. Not match state: GameScene reads it at
 * the start of a match (which parts the player may build) and records the
 * match at its end (`systems/AccountTracker.ts`).
 */
export interface AccountProgress {
  xp: number;
  /** Achievement counters: the best one match / Mech life reached, or the total over all games. */
  counters: Partial<Record<MechAchievementId, number>>;
  /** Dev: every part open. */
  allUnlocked?: boolean;
}

const STORAGE_KEY = 'aow-account';

export function loadAccount(): AccountProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AccountProgress>) : null;
    if (parsed && typeof parsed.xp === 'number' && Number.isFinite(parsed.xp)) {
      const counters: AccountProgress['counters'] = {};
      for (const id of Object.keys(MECH_ACHIEVEMENTS) as MechAchievementId[]) {
        const v = parsed.counters?.[id];
        if (typeof v === 'number' && Number.isFinite(v)) counters[id] = v;
      }
      return { xp: Math.max(0, parsed.xp), counters, ...(parsed.allUnlocked ? { allUnlocked: true } : {}) };
    }
  } catch {
    // Storage blocked or garbled: a fresh account.
  }
  return { xp: 0, counters: {} };
}

export function saveAccount(progress: AccountProgress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Not kept, nothing else lost.
  }
}

/** The account level for an XP total, and the XP into and needed for the next level. */
export function accountLevel(xp: number): { level: number; into: number; needed: number } {
  let level = 1;
  let left = xp;
  while (left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level++;
  }
  return { level, into: left, needed: xpForLevel(level) };
}

export function achievementDone(progress: AccountProgress, id: MechAchievementId): boolean {
  return (progress.counters[id] ?? 0) >= MECH_ACHIEVEMENTS[id].target;
}

export function unlockOpen(progress: AccountProgress, unlock: PartUnlock | undefined): boolean {
  if (!unlock || unlock.kind === 'base' || progress.allUnlocked) return true;
  if (unlock.kind === 'level') return accountLevel(progress.xp).level >= unlock.level;
  return achievementDone(progress, unlock.id);
}

/** A short line for a locked part: what it needs and how far along the account is. */
export function unlockText(progress: AccountProgress, unlock: PartUnlock | undefined): string {
  if (!unlock || unlock.kind === 'base') return '';
  if (unlock.kind === 'level') return `Account level ${unlock.level} (now ${accountLevel(progress.xp).level})`;
  const a = MECH_ACHIEVEMENTS[unlock.id];
  const have = Math.min(a.target, Math.floor(progress.counters[unlock.id] ?? 0));
  return `${a.about}: ${have.toLocaleString('en-US')}/${a.target.toLocaleString('en-US')}`;
}

/** Every part the account hasn't opened, as `slot kind:id` keys (`partKey`). */
export function lockedPartKeys(progress: AccountProgress): string[] {
  const out: string[] = [];
  const add = (kind: string, table: Readonly<Record<string, { unlock?: PartUnlock }>>): void => {
    for (const [id, part] of Object.entries(table)) if (!unlockOpen(progress, part.unlock)) out.push(`${kind}:${id}`);
  };
  add('legs', MECH_LEGS);
  add('torso', MECH_TORSOS);
  add('head', MECH_HEADS);
  add('arm', MECH_ARMS);
  add('module', MECH_MODULES);
  return out;
}

/** Account XP for a finished match. */
export function matchXp(result: { won: boolean; durationMs: number; kills: number; conquest: boolean }): number {
  const base = result.won ? ACCOUNT_XP.win : result.durationMs >= ACCOUNT_XP.longLossMs ? ACCOUNT_XP.longLoss : ACCOUNT_XP.loss;
  const kills = Math.floor(result.kills / ACCOUNT_XP.killsPer) * ACCOUNT_XP.perKills;
  return base + kills + (result.won && result.conquest ? ACCOUNT_XP.conquestWin : 0);
}
