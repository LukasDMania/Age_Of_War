/**
 * Prototype switches (2026-09-26, owner: "work out some prototype systems
 * but make them independent and easily reversible"). Each flag turns one
 * experimental system on or off; the code for each lives in its own files
 * and is only wired in when its flag is on, so removing an idea means
 * turning its flag off (or deleting its files and the few lines that check
 * the flag).
 *
 * Defaults are below; the title menu's Experiments panel overrides them per
 * browser (localStorage `aow-features`). Every flag is PROPOSED.
 */

export type FeatureId =
  | 'buildingPerks'
  | 'extraBuildings'
  | 'veterancy'
  | 'ageDoctrines'
  | 'warCry'
  | 'conquest'
  | 'moneyUnitRework'
  | 'ageCatchUp';

export interface FeatureInfo {
  label: string;
  about: string;
  default: boolean;
}

export const FEATURES_INFO: Readonly<Record<FeatureId, FeatureInfo>> = {
  buildingPerks: {
    label: 'Building perks',
    about: 'Every 5 building levels, pick one of two permanent perks for that building.',
    default: true,
  },
  extraBuildings: {
    label: 'Barracks, Shrine and Market',
    about: 'Three more buildings: faster training and tougher recruits, a stronger special, trading XP for gold.',
    default: true,
  },
  veterancy: {
    label: 'Veterancy',
    about: 'Units that score kills rank up (gold chevrons) and get tougher and stronger.',
    default: true,
  },
  ageDoctrines: {
    label: 'Age doctrines',
    about: 'On each age-up, pick one of three doctrines that shape your army for that age.',
    default: true,
  },
  warCry: {
    label: 'War Cry',
    about: 'A second, free cooldown ability (W): your army charges with extra speed and damage for a few seconds.',
    default: true,
  },
  moneyUnitRework: {
    label: 'Money units: growing income, loot',
    about: 'Money units earn more the longer they live (50% up to 200%), loot extra gold from nearby kills, and pay the enemy less when killed.',
    default: true,
  },
  ageCatchUp: {
    label: 'Age catch-up',
    about: 'The side behind in age gets +50% kill XP and +35% turret damage per age behind; a lagging AI follows within about 1-2 minutes.',
    default: true,
  },
  conquest: {
    label: 'Conquest mode',
    about: 'A roguelite campaign through all five ages: chapter maps, bosses, camps, events, relics, commanders and a Legacy tree.',
    default: true,
  },
};

const STORAGE_KEY = 'aow-features';

function loadOverrides(): Partial<Record<FeatureId, boolean>> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<FeatureId, boolean>>) : {};
  } catch {
    return {};
  }
}

const overrides = loadOverrides();

/** Whether a prototype is on (default, or the player's choice in the menu). */
export function feature(id: FeatureId): boolean {
  return overrides[id] ?? FEATURES_INFO[id].default;
}

/** Turns a prototype on or off for this browser (used by the menu). */
export function setFeature(id: FeatureId, on: boolean): void {
  overrides[id] = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage can be unavailable; the choice then lasts until reload.
  }
}

export const FEATURE_IDS = Object.keys(FEATURES_INFO) as FeatureId[];
