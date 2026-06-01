/**
 * rng.ts
 *
 * deterministic seeded Mulberry32 RNG. Every step() threads this; Math.random() is BANNED outside this module. Key exports: Rng, fnv1a, makeRng.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export interface Rng {
  next: () => number;
  int: (maxExclusive: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  chance: (p: number) => boolean;
  state: () => number;
  setState: (v: number) => void;
}

export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Continue an fnv1a hash from an existing accumulator. By construction
 * `fnv1aChain(fnv1a(a), b) === fnv1a(a + b)` (fnv1a folds left-to-right), so a
 * fixed prefix can be hashed ONCE and a varying suffix folded per call without
 * re-hashing the prefix or allocating the concatenated string — the per-word
 * hot path in apply.ts (B1-Y per-concept seeding) relies on this.
 */
export function fnv1aChain(h: number, str: string): number {
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeRng(seed: number | string): Rng {
  let s = (typeof seed === "string" ? fnv1a(seed) : seed) >>> 0;
  if (s === 0) s = 1;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick: (arr) => arr[Math.floor(next() * arr.length)]!,
    chance: (p) => next() < p,
    state: () => s,
    setState: (v) => {
      s = v >>> 0;
      if (s === 0) s = 1;
    },
  };
}

export function makeRngFromState(state: number): Rng {
  return makeRng(state);
}
