/**
 * Tunables of the prototype systems (2026-09-26; see `features.config.ts`
 * for the switches). Every number is PROPOSED.
 */
import type { ModifiableStat } from '@state/types';

/* ---- Veterancy -------------------------------------------------------------- */

/**
 * A kill is credited to the killer side's living combat unit nearest to
 * where the victim fell (within `creditRadius` px, edge to edge); units rank
 * up at these kill counts. Each rank sets the unit's max HP and damage
 * multipliers and heals it fully.
 */
export const VETERANCY = {
  creditRadius: 90,
  ranks: [
    { kills: 1, hp: 1.1, damage: 1.1 },
    { kills: 3, hp: 1.2, damage: 1.2 },
    { kills: 6, hp: 1.35, damage: 1.3 },
  ],
} as const;

/* ---- Age doctrines ------------------------------------------------------------ */

export interface DoctrineEffect {
  stat: ModifiableStat;
  mult: number;
  /** Unit slots affected; all units when absent. */
  slots?: readonly (1 | 2 | 3 | 4 | 5)[];
}

export interface Doctrine {
  id: string;
  name: string;
  about: string;
  effects: readonly DoctrineEffect[];
}

/**
 * On every age-up a side is offered three doctrines from this pool (never one
 * it already has) and picks one; they stack over the match.
 */
export const DOCTRINES: readonly Doctrine[] = [
  { id: 'shield-wall', name: 'Shield Wall', about: 'Melee +20% max HP', effects: [{ stat: 'maxHp', mult: 1.2, slots: [1] }] },
  {
    id: 'berserkers',
    name: 'Berserkers',
    about: 'Melee +12% damage, attack 10% faster',
    effects: [
      { stat: 'damage', mult: 1.12, slots: [1] },
      { stat: 'attackCooldown', mult: 0.9, slots: [1] },
    ],
  },
  {
    id: 'marksmen',
    name: 'Marksmen',
    about: 'Ranged +10% range and damage',
    effects: [
      { stat: 'range', mult: 1.1, slots: [2] },
      { stat: 'damage', mult: 1.1, slots: [2] },
    ],
  },
  { id: 'volley-fire', name: 'Volley Fire', about: 'Ranged attack 15% faster', effects: [{ stat: 'attackCooldown', mult: 0.85, slots: [2] }] },
  {
    id: 'juggernauts',
    name: 'Juggernauts',
    about: 'Heavies +15% max HP, take 8% less damage',
    effects: [
      { stat: 'maxHp', mult: 1.15, slots: [3] },
      { stat: 'damageTaken', mult: 0.92, slots: [3] },
    ],
  },
  { id: 'shock-troops', name: 'Shock Troops', about: 'Heavies +20% damage', effects: [{ stat: 'damage', mult: 1.2, slots: [3] }] },
  { id: 'forced-march', name: 'Forced March', about: 'All units walk 15% faster', effects: [{ stat: 'speed', mult: 1.15 }] },
  { id: 'hardened', name: 'Hardened', about: 'All units take 7% less damage', effects: [{ stat: 'damageTaken', mult: 0.93 }] },
  {
    id: 'support-corps',
    name: 'Support Corps',
    about: 'Money and utility units +40% max HP',
    effects: [{ stat: 'maxHp', mult: 1.4, slots: [4, 5] }],
  },
];

export const DOCTRINE_CHOICES = 3;

/* ---- War Cry -------------------------------------------------------------------- */

/**
 * A second, small ability (key W): for `durationMs` every unit of the side
 * walks `speedMult` faster and hits `damageMult` harder. Recharges in
 * `cooldownMs`; ready `firstReadyMs` into the match.
 */
export const WAR_CRY = {
  cooldownMs: 45000,
  durationMs: 6000,
  speedMult: 1.3,
  damageMult: 1.2,
  firstReadyMs: 20000,
} as const;
