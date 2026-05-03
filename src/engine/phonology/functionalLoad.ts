import type { Language, Phoneme, WordForm } from "../types";
import { featuresOf } from "./features";
import { stripTone } from "./tone";

/**
 * Phase 27b: functional-load measurement.
 *
 * Functional load is the standard linguistic metric for how indispensable
 * a phoneme is to a language's lexicon: how many distinct meanings would
 * become homophonous if the phoneme merged with its nearest neighbor?
 *
 * A phoneme that uniquely distinguishes 50 minimal pairs (cat/bat,
 * pat/bat, ...) has high functional load and rarely merges in real
 * languages. A phoneme that occurs in many words but never in a context
 * where its merger would create homophones has low functional load and
 * is a prime candidate for next merger.
 *
 * The simulator's previous prunePhonemes used raw frequency: a phoneme
 * occurring ≤ 2 times qualifies for retirement. This Phase-27b helper
 * replaces frequency with functional load — a much better predictor of
 * which phonemes survive long-term.
 *
 * Algorithm:
 *   1. Find the nearest feature-neighbor of `phoneme`.
 *   2. For each word in the lexicon containing `phoneme`, substitute
 *      the neighbor and check if the result collides with an existing
 *      word's form.
 *   3. Return the fraction of contexts that create a homophone.
 *
 * Value range: [0, 1].
 *   0 = merger creates no homophones; phoneme is dispensable.
 *   1 = every occurrence creates a homophone; phoneme is critical.
 *
 * Cached per-generation on `lang.functionalLoadCache` to avoid O(N²)
 * recomputation per step.
 */

function featuralDistance(a: Phoneme, b: Phoneme): number {
  if (a === b) return 0;
  const fa = featuresOf(a);
  const fb = featuresOf(b);
  if (!fa || !fb) return Infinity;
  if (fa.type !== fb.type) return Infinity;
  let d = 0;
  if (fa.type === "consonant" && fb.type === "consonant") {
    if (fa.place !== fb.place) d += 1;
    if (fa.manner !== fb.manner) d += 1;
    if (fa.voice !== fb.voice) d += 1;
    if ((fa.aspirated ?? false) !== (fb.aspirated ?? false)) d += 0.5;
    if ((fa.palatalised ?? false) !== (fb.palatalised ?? false)) d += 0.5;
    if ((fa.labialised ?? false) !== (fb.labialised ?? false)) d += 0.5;
  } else if (fa.type === "vowel" && fb.type === "vowel") {
    if (fa.height !== fb.height) d += 1;
    if (fa.backness !== fb.backness) d += 1;
    if (fa.round !== fb.round) d += 0.5;
    if ((fa.long ?? false) !== (fb.long ?? false)) d += 0.5;
    if ((fa.nasal ?? false) !== (fb.nasal ?? false)) d += 0.5;
  }
  return d;
}

function nearestNeighbour(
  candidate: Phoneme,
  inventory: readonly Phoneme[],
): Phoneme | null {
  let best: Phoneme | null = null;
  let bestD = Infinity;
  for (const p of inventory) {
    if (p === candidate) continue;
    const d = featuralDistance(candidate, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (bestD <= 2.5) return best;
  return null;
}

/**
 * Compute the functional load of a phoneme in a language.
 */
export function phonemeFunctionalLoad(
  lang: Language,
  phoneme: Phoneme,
): number {
  const inv = lang.phonemeInventory.segmental;
  const neighbour = nearestNeighbour(phoneme, inv);
  if (!neighbour) return 0; // isolated phoneme — no merger target, treat as low

  // Build a fingerprint set of every existing word's form-string.
  const existingForms = new Set<string>();
  for (const m of Object.keys(lang.lexicon)) {
    const f = lang.lexicon[m];
    if (f) existingForms.add(f.join(""));
  }

  let withPhoneme = 0;
  let homophonesCreated = 0;
  for (const m of Object.keys(lang.lexicon)) {
    const form = lang.lexicon[m];
    if (!form) continue;
    let contains = false;
    const merged: WordForm = form.map((raw) => {
      const tone = raw.length > stripTone(raw).length ? raw.slice(stripTone(raw).length) : "";
      const base = stripTone(raw);
      if (base === phoneme) {
        contains = true;
        return neighbour + tone;
      }
      return raw;
    });
    if (!contains) continue;
    withPhoneme++;
    const mergedStr = merged.join("");
    if (mergedStr !== form.join("") && existingForms.has(mergedStr)) {
      homophonesCreated++;
    }
  }

  if (withPhoneme === 0) return 0;
  return homophonesCreated / withPhoneme;
}

/**
 * Compute functional load for every phoneme in the language's inventory.
 * Caches result on `lang.functionalLoadCache` keyed by generation, so
 * subsequent calls in the same generation reuse the cache.
 */
export function functionalLoadMap(
  lang: Language,
  generation: number,
): Record<Phoneme, number> {
  const cache = lang.functionalLoadCache;
  if (cache && cache.generation === generation) {
    return cache.perPhoneme;
  }
  const out: Record<Phoneme, number> = {};
  for (const p of lang.phonemeInventory.segmental) {
    out[p] = phonemeFunctionalLoad(lang, p);
  }
  lang.functionalLoadCache = { generation, perPhoneme: out };
  return out;
}
