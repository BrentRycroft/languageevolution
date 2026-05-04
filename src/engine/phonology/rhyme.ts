import type { WordForm } from "../types";
import { isVowel, isSyllabic } from "./ipa";
import { stripTone } from "./tone";
import { stressIndex, type StressPattern } from "./stress";

/**
 * Phase 26d: extract a rhyme syllable from a word.
 *
 * The "rhyme" of a word is the final stressed nucleus + everything that
 * follows it (English: cat → /æt/, water → /ɔtər/, mountain → /ən/).
 * Two words rhyme when their rhyme syllables match.
 *
 * Strategy:
 *   1. Find the stressed vowel via the language's stressPattern.
 *   2. Take from that vowel index to the end of the word.
 *   3. Strip tone diacritics for matching.
 */
export function rhymeSyllable(
  form: WordForm,
  pattern: StressPattern = "penult",
  lexicalIdx?: number,
): WordForm {
  if (form.length === 0) return [];
  const stressed = stressIndex(form, pattern, lexicalIdx);
  if (stressed < 0 || stressed >= form.length) return form.slice();
  return form.slice(stressed).map((p) => stripTone(p));
}

/**
 * Predicate: do two forms rhyme? Two rhyme-syllables match when they
 * have identical phoneme sequences (after tone stripping). Single-vowel
 * matches count as weak rhymes (English "to/do/blue/few"); multi-
 * phoneme matches are strong rhymes ("cat/bat", "water/daughter").
 */
export function rhymesWith(
  a: WordForm,
  b: WordForm,
  pattern: StressPattern = "penult",
  lexicalIdxA?: number,
  lexicalIdxB?: number,
): boolean {
  const ra = rhymeSyllable(a, pattern, lexicalIdxA);
  const rb = rhymeSyllable(b, pattern, lexicalIdxB);
  if (ra.length === 0 || rb.length === 0) return false;
  if (ra.length !== rb.length) return false;
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return false;
  }
  return true;
}

/**
 * Phase 30 Tranche 30e: relaxed assonance match — same stressed
 * nucleus vowel even when codas differ. Used by `pickStanza` as a
 * second-tier fallback after strict rhyme fails.
 *
 * "cat" / "bag" assonate via /a/. "go" / "no" assonate via /o/.
 * Strict rhyme would reject "cat" vs "bag" but assonance accepts.
 */
export function assonatesWith(
  a: WordForm,
  b: WordForm,
  pattern: StressPattern = "penult",
  lexicalIdxA?: number,
  lexicalIdxB?: number,
): boolean {
  const ra = rhymeSyllable(a, pattern, lexicalIdxA);
  const rb = rhymeSyllable(b, pattern, lexicalIdxB);
  if (ra.length === 0 || rb.length === 0) return false;
  // Find the first vowel in each and compare.
  const va = ra.find((p) => isVowel(stripTone(p)) || isSyllabic(stripTone(p)));
  const vb = rb.find((p) => isVowel(stripTone(p)) || isSyllabic(stripTone(p)));
  if (!va || !vb) return false;
  return stripTone(va) === stripTone(vb);
}

/**
 * Count syllables in a word (= count of vowels and syllabic consonants).
 * Used by meter computation.
 */
export function syllableCount(form: WordForm): number {
  let n = 0;
  for (const p of form) {
    const base = stripTone(p);
    if (isVowel(base) || isSyllabic(base)) n++;
  }
  return n;
}
