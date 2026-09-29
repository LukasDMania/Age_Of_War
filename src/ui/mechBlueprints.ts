import { DEFAULT_MECH_DESIGN, type MechDesign } from '@config/mech.config';
import { isValidDesign } from '@entities/mechDesign';

/**
 * The hangar's blueprint slots (Mech expansion, section 1): a few named
 * designs kept per browser, one of them active. Editing a part in the
 * hangar edits the active blueprint; one key switches to the next. UI
 * state only, never match state (the build request carries the design).
 */

/** How many blueprint slots there are (PROPOSED; the brief says 3-5). */
export const BLUEPRINT_COUNT = 4;

export interface Blueprint {
  name: string;
  design: MechDesign;
}

interface Stored {
  active: number;
  slots: Blueprint[];
}

const STORAGE_KEY = 'aow-mech-blueprints';
/** Where the Workshop tab kept its single design before the hangar. */
const OLD_STORAGE_KEY = 'aow-mech-design';

function defaults(): Stored {
  return {
    active: 0,
    slots: Array.from({ length: BLUEPRINT_COUNT }, (_, i) => ({ name: `Blueprint ${i + 1}`, design: { ...DEFAULT_MECH_DESIGN } })),
  };
}

function read(): Stored {
  const out = defaults();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored> | null;
      if (parsed && Array.isArray(parsed.slots)) {
        parsed.slots.slice(0, BLUEPRINT_COUNT).forEach((slot, i) => {
          if (!slot || typeof slot !== 'object') return;
          const name = typeof slot.name === 'string' && slot.name.trim() ? slot.name.slice(0, 24) : out.slots[i]!.name;
          // Parts that no longer exist fall back to the default design's.
          const design = isValidDesign(slot.design) ? { ...slot.design } : upgradeDesign(slot.design);
          out.slots[i] = { name, design };
        });
      }
      if (parsed && Number.isInteger(parsed.active) && parsed.active! >= 0 && parsed.active! < BLUEPRINT_COUNT) out.active = parsed.active!;
      return out;
    }
    // First run with the hangar: the old Workshop design becomes blueprint 1.
    const old: unknown = JSON.parse(window.localStorage.getItem(OLD_STORAGE_KEY) ?? 'null');
    if (old) out.slots[0]!.design = upgradeDesign(old);
  } catch {
    // Storage blocked or garbled: the defaults.
  }
  return out;
}

/** A stored design with unknown or missing parts replaced by the default's. */
function upgradeDesign(value: unknown): MechDesign {
  const design: MechDesign = { ...DEFAULT_MECH_DESIGN };
  if (typeof value !== 'object' || value === null) return design;
  for (const slot of Object.keys(design) as (keyof MechDesign)[]) {
    const trial = { ...design, [slot]: (value as Record<string, unknown>)[slot] };
    if (isValidDesign(trial)) Object.assign(design, trial);
  }
  return design;
}

function write(stored: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Not kept, nothing else lost.
  }
}

/** Blueprints kept per browser; read once, written on every change. */
export class MechBlueprints {
  private stored: Stored = read();

  get active(): number {
    return this.stored.active;
  }

  get all(): readonly Blueprint[] {
    return this.stored.slots;
  }

  get design(): MechDesign {
    return { ...this.stored.slots[this.stored.active]!.design };
  }

  get name(): string {
    return this.stored.slots[this.stored.active]!.name;
  }

  /** Replaces the active blueprint's design. */
  setDesign(design: MechDesign): void {
    this.stored.slots[this.stored.active]!.design = { ...design };
    write(this.stored);
  }

  select(index: number): void {
    if (index < 0 || index >= BLUEPRINT_COUNT) return;
    this.stored.active = index;
    write(this.stored);
  }

  /** The next blueprint (wraps). */
  next(): void {
    this.select((this.stored.active + 1) % BLUEPRINT_COUNT);
  }

  rename(index: number, name: string): void {
    const slot = this.stored.slots[index];
    const clean = name.trim().slice(0, 24);
    if (!slot || !clean) return;
    slot.name = clean;
    write(this.stored);
  }
}
