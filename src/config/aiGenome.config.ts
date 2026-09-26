/**
 * The "utility AI" brain's parameters (owner, 2026-09-26: "think of a way to
 * have a more sophisticated AI and do some machine learning ... create some
 * AI profiles we can playtest").
 *
 * The brain (`systems/UtilityAI.ts`) scores every action it could take this
 * moment (each unit, turrets, upgrades, buildings, research, saving up) from
 * what it sees on the lane and in its purse. How much each consideration
 * counts is a genome of named numbers. Hand-written genomes are the named
 * profiles below; `tools/train-ai.mjs` evolves genomes by self-play
 * (headless matches against the classic AI and earlier champions) and writes
 * the winners to `config/aiTrained.json`.
 *
 * Every gene has a range; mutation stays inside it. All values PROPOSED.
 */
import trained from '@config/aiTrained.json';

export interface GeneSpec {
  min: number;
  max: number;
  /** Starting value (the "Balanced" profile). */
  base: number;
  /** What it does, for the docs and the profile picker. */
  about: string;
}

export const GENOME_SPEC = {
  // Army: how much it wants units right now.
  armyDrive: { min: 0, max: 3, base: 1, about: 'Baseline wish to field units' },
  armyTarget: { min: 0.5, max: 2.5, base: 1.15, about: 'Army value it wants relative to the enemy army' },
  armyFloor: { min: 0, max: 8, base: 3, about: 'Army value (in cheap units) it keeps at least' },
  armyUrgency: { min: 0, max: 3, base: 1, about: 'Extra wish per missing army value' },
  threatUnits: { min: 0, max: 4, base: 1.6, about: 'Extra wish for units while enemies are near its base' },
  // Unit choice.
  bias1: { min: 0.1, max: 2, base: 1, about: 'Preference for slot 1 (melee)' },
  bias2: { min: 0.1, max: 2, base: 0.7, about: 'Preference for slot 2 (ranged)' },
  bias3: { min: 0.1, max: 2, base: 0.45, about: 'Preference for slot 3 (heavy)' },
  counter: { min: 0, max: 3, base: 1, about: 'How hard it counters the enemy composition' },
  mix: { min: 0, max: 2, base: 0.6, about: 'Penalty for piling into one unit type' },
  utilityEvery: { min: 2, max: 12, base: 5, about: 'Fighters between two utility units' },
  // Economy.
  mine: { min: 0, max: 3, base: 1.1, about: 'Weight on Mine levels (payback-based)' },
  library: { min: 0, max: 3, base: 0.6, about: 'Weight on Library levels (faster ages)' },
  forge: { min: 0, max: 3, base: 0.5, about: 'Weight on Forge levels (research tiers)' },
  research: { min: 0, max: 3, base: 0.7, about: 'Weight on research' },
  focusMelee: { min: 0, max: 2, base: 1, about: 'Research focus: melee' },
  focusRanged: { min: 0, max: 2, base: 0.8, about: 'Research focus: ranged' },
  focusHeavy: { min: 0, max: 2, base: 0.6, about: 'Research focus: heavy' },
  focusTurret: { min: 0, max: 2, base: 0.5, about: 'Research focus: turrets' },
  focusBounty: { min: 0, max: 2, base: 0.4, about: 'Research focus: kill gold' },
  moneyUnits: { min: 0, max: 3, base: 0.6, about: 'Weight on money units (slot 4)' },
  moneySafety: { min: 1, max: 3, base: 1.4, about: 'Army lead it needs before buying money units' },
  moneyMax: { min: 0, max: 4, base: 1, about: 'Most money units alive at once' },
  horizon: { min: 120, max: 900, base: 420, about: 'Seconds it expects an investment to keep paying' },
  // Defense.
  turrets: { min: 0, max: 3, base: 0.8, about: 'Weight on building turrets' },
  turretSlots: { min: 0, max: 5, base: 2.5, about: 'Turret slots it aims to fill' },
  turretUpgrade: { min: 0, max: 3, base: 0.6, about: 'Weight on turret upgrades' },
  turretThreat: { min: 0, max: 3, base: 1, about: 'Extra turret wish when its base is hurt or threatened' },
  modernize: { min: 0, max: 3, base: 1, about: 'Wish to replace outdated turrets' },
  kindRapid: { min: 0.1, max: 2, base: 1, about: 'Turret preference: rapid' },
  kindHeavy: { min: 0.1, max: 2, base: 0.7, about: 'Turret preference: heavy' },
  kindArea: { min: 0.1, max: 2, base: 0.9, about: 'Turret preference: area' },
  // Tempo and spending.
  saveThreshold: { min: 0, max: 2, base: 0.6, about: 'Saves up for its top wish above this score' },
  costAversion: { min: 0, max: 1, base: 0.15, about: 'How much a high price lowers a wish' },
  reserve: { min: 0, max: 4, base: 1.5, about: 'Gold (in cheap units) kept for emergencies' },
  ageUpDelay: { min: 0, max: 60, base: 4, about: 'Seconds it waits after it can age up' },
  specialTargets: { min: 1, max: 8, base: 3, about: 'Enemy units on the lane before it fires the special' },
  specialDefensive: { min: 0, max: 1, base: 0.3, about: 'Above 0.5: only fires the special in defence' },
} as const satisfies Record<string, GeneSpec>;

export type GeneId = keyof typeof GENOME_SPEC;
export type AiGenome = Record<GeneId, number>;

export const GENE_IDS = Object.keys(GENOME_SPEC) as GeneId[];

export function baseGenome(): AiGenome {
  const g = {} as AiGenome;
  for (const id of GENE_IDS) g[id] = GENOME_SPEC[id].base;
  return g;
}

/** A genome from partial values over the base, clamped to the ranges. */
export function makeGenome(values: Partial<Record<string, number>>): AiGenome {
  const g = baseGenome();
  for (const id of GENE_IDS) {
    const v = values[id];
    if (typeof v === 'number' && Number.isFinite(v)) g[id] = Math.min(GENOME_SPEC[id].max, Math.max(GENOME_SPEC[id].min, v));
  }
  return g;
}

/** A named AI personality for the menu. `classic` uses the Phase 12 controller. */
export interface AiProfile {
  id: string;
  label: string;
  description: string;
  brain: 'classic' | 'utility';
  genome?: AiGenome;
  /** Trained profiles: how it was made (generations, win rate). */
  trainedNote?: string;
}

interface TrainedFile {
  profiles?: { id: string; label: string; description: string; genome: Record<string, number>; note?: string }[];
}

const TRAINED = (trained as TrainedFile).profiles ?? [];

/**
 * Profiles to playtest (PROPOSED). The difficulty (Easy / Normal / Hard)
 * still sets reaction time, income and the opening; the profile sets the
 * strategy.
 */
export const AI_PROFILES: readonly AiProfile[] = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'The original scripted AI (Phase 12 rules).',
    brain: 'classic',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Utility AI with the hand-tuned starting weights.',
    brain: 'utility',
    genome: baseGenome(),
  },
  {
    id: 'warlord',
    label: 'Warlord',
    description: 'All-in aggression: big armies, heavies, few buildings.',
    brain: 'utility',
    genome: makeGenome({
      armyDrive: 2.2, armyTarget: 1.8, armyUrgency: 2, bias3: 1, counter: 0.6, mine: 0.6, library: 0.2,
      forge: 0.3, research: 0.4, focusMelee: 1.6, focusHeavy: 1.4, moneyUnits: 0, turrets: 0.2, turretSlots: 1,
      turretUpgrade: 0.2, saveThreshold: 1.2, reserve: 0.5, ageUpDelay: 0, specialTargets: 2, specialDefensive: 0,
    }),
  },
  {
    id: 'turtle',
    label: 'Turtle',
    description: 'Walls of turrets, upgrades and research, then a late push.',
    brain: 'utility',
    genome: makeGenome({
      armyDrive: 0.7, armyTarget: 0.9, threatUnits: 2.4, turrets: 2.2, turretSlots: 5, turretUpgrade: 1.6,
      turretThreat: 2, modernize: 1.6, forge: 1.2, research: 1.2, focusTurret: 1.8, mine: 1.3, moneyUnits: 0.3,
      specialDefensive: 1, specialTargets: 4, kindHeavy: 1.2, kindArea: 1.3,
    }),
  },
  {
    id: 'economist',
    label: 'Economist',
    description: 'Mines, libraries and money units; races through the ages.',
    brain: 'utility',
    genome: makeGenome({
      mine: 2.4, library: 2, forge: 0.8, moneyUnits: 1.8, moneySafety: 1.15, moneyMax: 3, horizon: 700,
      armyDrive: 0.8, armyTarget: 1, turrets: 0.9, turretSlots: 2, ageUpDelay: 0, focusBounty: 1.4,
    }),
  },
  {
    id: 'tactician',
    label: 'Tactician',
    description: 'Reads your army and counters it hard; keeps a healer close.',
    brain: 'utility',
    genome: makeGenome({
      counter: 2.6, mix: 1.4, bias2: 1, bias3: 0.8, utilityEvery: 3, armyTarget: 1.3, research: 1,
      focusRanged: 1.4, specialTargets: 4, specialDefensive: 0.2,
    }),
  },
  ...TRAINED.map(
    (t): AiProfile => ({
      id: t.id,
      label: t.label,
      description: t.description,
      brain: 'utility',
      genome: makeGenome(t.genome),
      ...(t.note ? { trainedNote: t.note } : {}),
    }),
  ),
];

export const DEFAULT_AI_PROFILE = 'classic';

export function findAiProfile(id: string | null | undefined): AiProfile | undefined {
  return AI_PROFILES.find((p) => p.id === id);
}
