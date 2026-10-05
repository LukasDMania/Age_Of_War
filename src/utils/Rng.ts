/**
 * Seeded random numbers (multiplayer groundwork, 2026-10-05). Lockstep
 * multiplayer runs the same battle in two browsers, so anything random that
 * changes the battle must come from a generator both sides seed alike, never
 * `Math.random`. Visual-only randomness (particles, sparks) may keep using
 * `Math.random`.
 *
 * mulberry32: 32-bit state, integer math only, so every engine gives the
 * same sequence.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** A float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** An integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** A generator of its own for one consumer, so consumers don't shift each other's sequences. */
  static derive(seed: number, label: string): Rng {
    let h = seed >>> 0;
    for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
    return new Rng(h);
  }
}

/** A fresh seed for a match nobody asked to replay. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
