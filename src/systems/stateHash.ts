import type { MatchState } from '@state/GameState';
import type { Unit } from '@entities/Unit';
import type { Projectile } from '@entities/Projectile';

/**
 * A fingerprint of the battle (multiplayer groundwork, 2026-10-05). Two
 * lockstep browsers compare it every so often: a mismatch means the games
 * have drifted apart (a desync). The determinism check compares it between
 * replays of one match.
 *
 * Covers both `SideState`s whole (gold, XP, age, base HP, queues, turrets,
 * buildings, Mech, modifiers) plus every unit and projectile in play, in
 * pool order (a different order is a desync too). Numbers go in through
 * `String(n)`, which is exact for doubles, so the smallest drift shows.
 */
export function hashMatch(state: MatchState, tick: number, units: Iterable<Unit>, projectiles: Iterable<Projectile>): string {
  let h = fnv(FNV_OFFSET, `${tick}|${state.phase}|${JSON.stringify(state.player)}|${JSON.stringify(state.enemy)}`);
  for (const u of units) {
    h = fnv(
      h,
      `u${u.instanceId}:${u.definition.id}:${u.side}:${u.unitState}:${u.x}:${u.y}:${u.hp}:${u.shield}:` +
        `${u.attackReadyAt}:${u.strikeAt}:${u.utilityReadyAt}:${u.kills}:${u.modifiers.map((m) => `${m.id}*${m.mult}`).join(',')}`,
    );
  }
  for (const p of projectiles) h = fnv(h, `p${p.key}:${p.side}:${p.x}:${p.y}:${p.damage}:${p.ageMs}`);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const FNV_OFFSET = 0x811c9dc5;

/** FNV-1a over the string's UTF-16 code units. */
function fnv(h: number, text: string): number {
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
