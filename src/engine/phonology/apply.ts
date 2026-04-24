import type { Lexicon, Meaning, SoundChange, WordForm } from "../types";
import type { Rng } from "../rng";
import { soundChangeSensitivity } from "../lexicon/expressive";
import { corenessResistance } from "../lexicon/coreness";
import { isFormLegal } from "./wordShape";

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
  /**
   * Age-grading: map of meaning → generations since its form last changed.
   * Freshly-changed words (age 0-2) mutate a little more, modelling young
   * speakers continuing to refine innovations before they entrench.
   */
  agesSinceChange?: Record<Meaning, number>;
  /**
   * Register tag per meaning. "high" words resist change (formal speech
   * conserves older forms); "low" words change a bit faster.
   */
  registerOf?: Record<Meaning, "high" | "low">;
}

/**
 * Age-grading multiplier. Freshly-changed words keep drifting for a few
 * generations as speakers refine the innovation; old stable words sit at
 * the baseline.
 *
 * Curve (asymptotic to 1.0, never drops below):
 *   age  0 → 1.40
 *   age  3 → 1.15
 *   age  8 → 1.03
 *   age 30 → ~1.00
 * A never-changed word (age === undefined) also returns 1.0.
 */
function ageBoost(age: number | undefined): number {
  if (age === undefined || age < 0) return 1;
  return 1 + 0.4 * Math.exp(-age / 3);
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
  // Register effect: formal-register words resist change. We fold it
  // into the frequency exponent rather than the post-hoc lambda
  // multiplier so it interacts coherently with frequency: a high-
  // register, high-frequency word should still resist change. The old
  // post-multiplier let frequency bypass register on common formal
  // words.
  const register = opts.registerOf?.[meaning];
  const registerShift = register === "high" ? -0.15 : register === "low" ? 0.05 : 0;
  // High-frequency words: exponent > 1 keeps probability closer to base.
  // Low-frequency words: exponent < 1 suppresses small probabilities.
  // Register lowers (high) or raises (low) the effective frequency.
  const freqExponent = 0.4 + Math.max(0.05, Math.min(1, freq + registerShift)) * 1.2;
  const age = opts.agesSinceChange?.[meaning];
  const ageMult = ageBoost(age);
  // Swadesh-tier protection. Core vocabulary (water, mother, eye,
  // two…) is measurably more stable than Zipf frequency alone
  // captures — replacement rates on Swadesh-100 items are a fraction
  // of those on rarer vocabulary with the same surface frequency.
  // `corenessResistance` returns a multiplier in (0, 1] that divides
  // the baseline lambda.
  const coreMult = corenessResistance(meaning);

  let current = word;
  for (const change of changes) {
    const weight = opts.weights[change.id] ?? change.baseWeight;
    if (weight <= 0) continue;
    const base = change.probabilityFor(current);
    if (base <= 0) continue;

    const adjusted = Math.pow(base, 1 / Math.max(0.01, freqExponent));
    // Attrition slowdown. Already-short words resist further
    // deletion — a 2-phoneme form barely reduces, a 7-phoneme form
    // has normal drift. Real languages preserve their minimum-word
    // forms aggressively after a certain point (English kept /dɒg/
    // and /kæt/ stable for 1000 years). Linear in length, clipped.
    const lenFactor = Math.min(1, Math.max(0.25, (current.length - 1) / 4));
    const lambda = Math.min(
      3,
      adjusted *
        weight *
        opts.globalRate *
        mult *
        ageMult *
        coreMult *
        lenFactor,
    );

    const hits = samplePoissonBounded(lambda, rng);
    for (let i = 0; i < hits; i++) {
      const next = change.apply(current, rng);
      if (next === current) break;
      // Minimum-word guard. Content words keep a two-segment floor;
      // pronouns / deictics / function words may shrink to a single
      // vowel. A deletion that produces an illegal short form is
      // reverted for this iteration only (the rule may still succeed
      // at another site next generation).
      if (!isFormLegal(meaning, next)) break;
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
    const sensitivity = soundChangeSensitivity(m);
    // Expressive / ideophonic words skip the change pass most of the time,
    // preserving their iconicity for many generations.
    if (sensitivity < 1 && !rng.chance(sensitivity)) {
      out[m] = lexicon[m]!.slice();
      continue;
    }
    const next = applyChangesToWord(lexicon[m]!, changes, rng, opts, m);
    // Drop meanings whose form deletion-rules reduced to zero segments —
    // the word has effectively been erased. Without this, empty lexicon
    // entries accumulate and break downstream consumers.
    if (next.length === 0) continue;
    // Word-shape guard. Every word needs a nucleus (vowel or syllabic
    // resonant), and content words specifically need ≥ 2 segments.
    // Pronouns and deictics on the `ALLOWED_MONOSYLLABIC` list may
    // shrink to a single vowel. Rules firing in pathological orders
    // can produce shapes that pass the per-step iteration guard but
    // still end up illegal by the time all changes have been applied
    // — compensatory lengthening on a 2-phoneme form, for instance,
    // yields a single long vowel [Vː]. Revert those to the prior
    // generation's form instead of committing.
    if (!isFormLegal(m, next)) {
      out[m] = lexicon[m]!.slice();
      continue;
    }
    out[m] = next;
  }

  // Anti-homophony guard. If two distinct meanings collapsed to the
  // same surface form, restore the lower-frequency one from the input
  // lexicon — in real languages, functional-load pressure blocks or
  // undoes merges that would erase a meaningful contrast. Without this,
  // cascading deletions produce near-universal homophones like "water"
  // and "beer" both reducing to /r/.
  const freq = opts.frequencyHints ?? {};
  const byForm = new Map<string, string[]>();
  for (const m of Object.keys(out)) {
    const key = out[m]!.join(" ");
    const bucket = byForm.get(key);
    if (bucket) bucket.push(m);
    else byForm.set(key, [m]);
  }
  for (const [, meanings] of byForm) {
    if (meanings.length < 2) continue;
    // Keep the highest-frequency member; revert the rest to their
    // pre-change forms (still phonotactically valid since we're
    // copying the prior generation).
    meanings.sort((a, b) => (freq[b] ?? 0.5) - (freq[a] ?? 0.5));
    for (let i = 1; i < meanings.length; i++) {
      const loser = meanings[i]!;
      const revert = lexicon[loser];
      if (revert && revert.length > 0) {
        out[loser] = revert.slice();
      }
    }
  }
  return out;
}
