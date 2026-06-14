/**
 * synonymSelect.ts — G4: commonness / markedness-aware synonym selection.
 *
 * `markednessOf(lang, meaning, form)` scores how MARKED (rare, register-restricted)
 * a particular form is among a meaning's synonyms — lower = more common / unmarked,
 * so the neutral default is the lowest-markedness form. The score is AGNOSTIC: it is
 * derived from the language's OWN frequencies, with the G1 corpus-rank prior only as
 * a tie-shaping prior for English-keyed concepts. No hardcoded English judgements.
 *
 * Blend:
 *   - form usage (per-sense `weight`, the language's own dominance signal for this
 *     form within the meaning): higher usage → lower markedness.
 *   - corpus-rank prior (`rankOf(meaning)` from G1): a rarer CONCEPT is marked at a
 *     higher baseline. Same across a meaning's forms, so it shifts the meaning's
 *     baseline without overriding the per-form usage signal.
 *
 * Pure + deterministic (no RNG, no mutation): a function of the stored sense weight
 * and the static corpus rank.
 */
import type { Language, Meaning, WordForm } from "../types";
import { rankOf, MAX_RANK } from "../semantics/corpusRank";
import { findWordsByMeaning, formKeyOf } from "./word";

/** Weight of form usage vs. the corpus-rank concept prior in the markedness blend. */
const USAGE_WEIGHT = 0.7;
const RANK_WEIGHT = 0.3;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Markedness of `form` as a realisation of `meaning` in `lang`. Lower = more common /
 * unmarked (the neutral default); higher = rarer / register-restricted. Range [0, 1].
 */
export function markednessOf(lang: Language, meaning: Meaning, form: WordForm): number {
  const key = formKeyOf(form);
  // The form's in-language usage for this meaning: its sense weight. Synonyms carry a
  // lower weight than the dominant/primary form, so a rare synonym reads as more marked.
  let usage = 0;
  for (const w of findWordsByMeaning(lang, meaning)) {
    if (w.formKey !== key) continue;
    const s = w.senses.find((sn) => sn.meaning === meaning);
    if (s) usage = s.weight;
    break;
  }
  const usageMark = 1 - clamp01(usage); // low usage → high markedness
  // Concept-level prior: rarer concepts (high corpus rank) sit at a higher baseline.
  const rankPrior = rankOf(meaning) / Math.max(1, MAX_RANK);
  return clamp01(USAGE_WEIGHT * usageMark + RANK_WEIGHT * rankPrior);
}
