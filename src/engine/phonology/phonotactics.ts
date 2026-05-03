import type { Language, WordForm } from "../types";
import { isConsonant, isVowel, isSyllabic } from "./ipa";
import { stripTone } from "./tone";

/**
 * Phase 27a: phonotactic / syllable-shape constraints.
 *
 * Real languages constrain word shapes:
 *   - Hawaiian: CV (max-onset 1, max-coda 0).
 *   - Japanese: (C)V(/n/) — single consonants, only /n/ in coda.
 *   - Spanish: (C)CVC — onsets up to 2, codas usually 1.
 *   - English: CCCVCCC — substantial clusters (strengths/sphincters).
 *   - Georgian: CCCCVCCCCC — fearless clustering.
 *
 * The engine tracks each language's profile and uses it as a SOFT BIAS
 * (not a hard gate). Heavy violations get penalised in coinage scoring,
 * borrowing-form adaptation, and post-rule output evaluation. The
 * existing `isFormLegal` predicate stays loose — phonotactics is a
 * gradient pressure, not binary legality.
 */

export interface PhonotacticProfile {
  maxOnset: number;
  maxCoda: number;
  maxCluster: number;
  strictness: number;
}

export const PERMISSIVE_PROFILE: PhonotacticProfile = {
  maxOnset: 3,
  maxCoda: 4,
  maxCluster: 4,
  strictness: 0.4,
};

/**
 * Treat a phoneme as a "consonant for clustering purposes" when it's
 * neither a vowel nor a syllabic consonant (which functions as a
 * nucleus). Tone diacritics are stripped before classification so
 * `aˋ` doesn't get mis-counted as a consonant.
 */
function isClusterC(p: string): boolean {
  const base = stripTone(p);
  if (isVowel(base) || isSyllabic(base)) return false;
  return isConsonant(base);
}

/**
 * Find the longest run of consecutive cluster consonants at the start
 * of the word.
 */
export function onsetClusterLen(form: WordForm): number {
  let n = 0;
  while (n < form.length && isClusterC(form[n]!)) n++;
  return n;
}

/**
 * Find the longest run of consecutive cluster consonants at the end
 * of the word.
 */
export function codaClusterLen(form: WordForm): number {
  let n = 0;
  let i = form.length - 1;
  while (i >= 0 && isClusterC(form[i]!)) {
    n++;
    i--;
  }
  return n;
}

/**
 * Find the largest medial-cluster size in the word (consecutive
 * consonants flanked on both sides by syllabic nuclei).
 */
export function maxMedialCluster(form: WordForm): number {
  let max = 0;
  let i = 0;
  // Skip the onset cluster.
  while (i < form.length && isClusterC(form[i]!)) i++;
  // Walk through, finding cluster runs that aren't onset or coda.
  while (i < form.length) {
    if (isClusterC(form[i]!)) {
      const start = i;
      while (i < form.length && isClusterC(form[i]!)) i++;
      // i is now the index past the cluster end. If we've hit the end
      // of the word, this is the coda — don't count it.
      if (i < form.length) {
        const len = i - start;
        if (len > max) max = len;
      }
    } else {
      i++;
    }
  }
  return max;
}

/**
 * Score a form against a phonotactic profile. Returns a number in
 * [0, 1]:
 *   - 1.0 = fully compliant (no violations).
 *   - 0.0 = severe violations across all dimensions.
 *
 * Each violated dimension contributes a penalty proportional to (a)
 * how much it exceeds the limit and (b) the profile's `strictness`.
 * The score multiplies penalties so combined violations compound.
 *
 * A profile with `strictness === 0` always returns 1 (no enforcement).
 */
export function phonotacticScore(
  form: WordForm,
  profile: PhonotacticProfile,
): number {
  if (form.length === 0) return 1;
  if (profile.strictness <= 0) return 1;

  const onset = onsetClusterLen(form);
  const coda = codaClusterLen(form);
  const medial = maxMedialCluster(form);

  // Penalty: (excess / limit) clamped to [0, 1], scaled by strictness.
  const onsetExcess = Math.max(0, onset - profile.maxOnset);
  const codaExcess = Math.max(0, coda - profile.maxCoda);
  const medialExcess = Math.max(0, medial - profile.maxCluster);

  // Each excess phoneme docks the score by `strictness * 0.3`.
  const onsetPenalty = Math.min(1, onsetExcess * profile.strictness * 0.3);
  const codaPenalty = Math.min(1, codaExcess * profile.strictness * 0.3);
  const medialPenalty = Math.min(1, medialExcess * profile.strictness * 0.3);

  // Multiplicative: combined violations compound.
  return Math.max(0, (1 - onsetPenalty) * (1 - codaPenalty) * (1 - medialPenalty));
}

/**
 * Convenience: score using the language's profile (or PERMISSIVE if
 * undefined for back-compat with pre-Phase-27 saves).
 */
export function langPhonotacticScore(
  lang: Language,
  form: WordForm,
): number {
  const profile = lang.phonotacticProfile ?? PERMISSIVE_PROFILE;
  return phonotacticScore(form, profile);
}

/**
 * UI-friendly badge string summarising the profile shape.
 *   maxOnset 1 + maxCoda 0 → "CV"
 *   maxOnset 1 + maxCoda 1 → "CVC"
 *   maxOnset 2 + maxCoda 1 → "(C)CVC"
 *   maxOnset 3 + maxCoda 4 → "CCCVCCCC"
 */
export function profileBadge(profile: PhonotacticProfile): string {
  const o = profile.maxOnset;
  const c = profile.maxCoda;
  const onsetStr = o === 0 ? "" : "C".repeat(Math.min(o, 4));
  const codaStr = c === 0 ? "" : "C".repeat(Math.min(c, 4));
  return `${onsetStr}V${codaStr}`;
}
