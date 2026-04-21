import type { Lexicon, Meaning, SoundChange, WordForm } from "../types";
import type { Rng } from "../rng";

export interface ApplyOptions {
  globalRate: number;
  weights: Record<string, number>;
  /**
   * Per-language per-generation modulator (see `phonology/rate.ts`).
   * Defaults to 1.
   */
  rateMultiplier?: number;
  /**
   * Map of meaning → frequency in [0, 1]. High-frequency words mutate faster
   * (lexical-frequency effect). Missing entries default to 0.5.
   */
  frequencyHints?: Record<Meaning, number>;
}

const DEFAULT_FREQUENCY = 0.5;

function frequencyFor(meaning: Meaning, hints?: Record<Meaning, number>): number {
  if (!hints) return DEFAULT_FREQUENCY;
  const v = hints[meaning];
  return typeof v === "number" ? Math.max(0, Math.min(1, v)) : DEFAULT_FREQUENCY;
}

/**
 * Apply every enabled change to a single word, possibly at multiple sites.
 * Each change rolls a Poisson-ish number of applications based on its effective
 * probability. Lexical-frequency bias makes common words evolve faster.
 */
export function applyChangesToWord(
  word: WordForm,
  changes: SoundChange[],
  rng: Rng,
  opts: ApplyOptions,
  meaning: Meaning = "",
): WordForm {
  const mult = opts.rateMultiplier ?? 1;
  const freq = frequencyFor(meaning, opts.frequencyHints);
  // High-frequency words: exponent > 1 keeps probability closer to base.
  // Low-frequency words: exponent < 1 suppresses small probabilities.
  const freqExponent = 0.4 + freq * 1.2;

  let current = word;
  for (const change of changes) {
    const weight = opts.weights[change.id] ?? change.baseWeight;
    if (weight <= 0) continue;
    const base = change.probabilityFor(current);
    if (base <= 0) continue;

    const adjusted = Math.pow(base, 1 / Math.max(0.01, freqExponent));
    const lambda = Math.min(3, adjusted * weight * opts.globalRate * mult);

    const hits = samplePoissonBounded(lambda, rng);
    for (let i = 0; i < hits; i++) {
      const next = change.apply(current, rng);
      if (next === current) break;
      current = next;
    }
  }
  return current;
}

/**
 * Small-lambda Poisson sampler, bounded at 4 to avoid runaway on pathological
 * inputs. Good enough for λ ≤ ~3.
 */
function samplePoissonBounded(lambda: number, rng: Rng): number {
  if (lambda <= 0) return 0;
  // Inversion by direct exp trick.
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  while (k < 4) {
    p *= rng.next();
    if (p <= L) return k;
    k++;
  }
  return k;
}

export function applyChangesToLexicon(
  lexicon: Lexicon,
  changes: SoundChange[],
  rng: Rng,
  opts: ApplyOptions,
): Lexicon {
  const out: Lexicon = {};
  const meanings = Object.keys(lexicon).sort();
  for (const m of meanings) {
    out[m] = applyChangesToWord(lexicon[m]!, changes, rng, opts, m);
  }
  return out;
}
