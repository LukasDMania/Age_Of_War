import { Rng } from '@utils/Rng';
import { DOCTRINE_CHOICES, DOCTRINES, type Doctrine } from '@config/experiments.config';
import type { UnitFactory } from '@entities/UnitFactory';
import type { MatchState } from '@state/GameState';
import { SIDES, type Side } from '@state/types';
import { setSideModifier } from '@systems/statusOps';
import { emit, Events, on } from '@utils/EventBus';

/** Sim ms between an age-up and its doctrine offer. */
const OFFER_DELAY_MS = 400;

export function findDoctrine(id: string): Doctrine | undefined {
  return DOCTRINES.find((d) => d.id === id);
}

/**
 * Age doctrines (prototype, feature `ageDoctrines`, 2026-09-26): every time a
 * side ages up it is offered `DOCTRINE_CHOICES` doctrines from `DOCTRINES`
 * (never one it already has) and picks one; doctrines stack for the rest of
 * the match. Their effects are side-wide unit modifiers through `statusOps`,
 * so units already on the lane and later units both get them. An offer
 * stays open until a pick (the next age-up replaces an unanswered offer).
 *
 * Listens for: `age-changed`, `choose-doctrine-requested`.
 * Emits: `doctrine-offered`, `doctrine-chosen`; `modifier-applied` through statusOps.
 */
export class DoctrineSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly chosen: Record<Side, string[]> = { player: [], enemy: [] };
  private readonly offers: Record<Side, readonly string[] | null> = { player: null, enemy: null };
  /** Offers are announced a moment after the age-up (the HUD rebuilds itself then). */
  private readonly due: Record<Side, { age: number; at: number } | null> = { player: null, enemy: null };
  private readonly clock: () => number;
  private readonly cleanups: (() => void)[];

  /** Seeded: both lockstep browsers (and a replay) offer the same doctrines. */
  private readonly rng: Rng;

  constructor(state: MatchState, units: UnitFactory, clock: () => number) {
    this.state = state;
    this.rng = Rng.derive(state.seed, 'doctrines');
    this.units = units;
    this.clock = clock;
    this.cleanups = [
      on(Events.AgeChanged, ({ side, age }) => {
        this.due[side] = { age, at: this.clock() + OFFER_DELAY_MS };
      }),
      on(Events.ChooseDoctrineRequested, ({ side, doctrineId }) => this.choose(side, doctrineId)),
    ];
  }

  /** Doctrines a side has, in the order picked. */
  doctrinesOf(side: Side): readonly string[] {
    return this.chosen[side];
  }

  /** `nowMs` is the simulation clock. */
  update(nowMs: number): void {
    for (const side of SIDES) {
      const due = this.due[side];
      if (due && nowMs >= due.at) {
        this.due[side] = null;
        this.offer(side, due.age);
      }
    }
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  private offer(side: Side, age: number): void {
    const pool = DOCTRINES.filter((d) => !this.chosen[side].includes(d.id)).map((d) => d.id);
    const options: string[] = [];
    while (options.length < DOCTRINE_CHOICES && pool.length > 0) {
      options.push(pool.splice(this.rng.int(pool.length), 1)[0]!);
    }
    if (options.length === 0) return;
    this.offers[side] = options;
    emit(Events.DoctrineOffered, { side, age, options });
  }

  private choose(side: Side, doctrineId: string): void {
    if (!SIDES.includes(side) || !this.offers[side]?.includes(doctrineId)) return;
    const doctrine = findDoctrine(doctrineId);
    if (!doctrine) return;
    this.offers[side] = null;
    this.chosen[side].push(doctrineId);
    doctrine.effects.forEach((effect, i) => {
      setSideModifier(this.state, this.units.activeUnits, side, {
        id: `doctrine-${doctrine.id}-${i}`,
        source: 'doctrine',
        stat: effect.stat,
        mult: effect.mult,
        ...(effect.slots ? { onlySlots: effect.slots } : {}),
      });
    });
    emit(Events.DoctrineChosen, { side, doctrineId });
  }
}

/**
 * Picks doctrines for an AI-played side (prototype): the doctrine whose
 * effects cover most of its army's value, a moment after the offer. Acts only
 * through `choose-doctrine-requested`, like any AI decision.
 */
export class DoctrineAi {
  private readonly side: Side;
  private readonly units: UnitFactory;
  private readonly cleanups: (() => void)[];

  private readonly rng: Rng;

  constructor(side: Side, units: UnitFactory, seed: number) {
    this.side = side;
    this.rng = Rng.derive(seed, `doctrine-ai-${side}`);
    this.units = units;
    this.cleanups = [
      on(Events.DoctrineOffered, ({ side, options }) => {
        if (side === this.side) this.pick(options);
      }),
    ];
  }

  destroy(): void {
    for (const off of this.cleanups) off();
  }

  private pick(options: readonly string[]): void {
    const value: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0 };
    for (const unit of this.units.activeUnits) {
      if (unit.side === this.side && unit.isAlive) value[unit.definition.slot] = (value[unit.definition.slot] ?? 0) + unit.definition.cost;
    }
    const total = Object.values(value).reduce((a, b) => a + b, 0);
    let best = options[0]!;
    let bestScore = -1;
    for (const id of options) {
      const d = findDoctrine(id);
      if (!d) continue;
      const score = d.effects.reduce((s, e) => s + (e.slots ? e.slots.reduce((t, slot) => t + (value[slot] ?? 0), 0) : total * 0.6), 0) * (0.8 + this.rng.next() * 0.4);
      if (score > bestScore) {
        best = id;
        bestScore = score;
      }
    }
    emit(Events.ChooseDoctrineRequested, { side: this.side, doctrineId: best });
  }
}
