import type { Language, Phoneme } from "../types";
import { isVowel } from "../phonology/ipa";

/**
 * Estimate the phonotactic "fit" of a candidate form against a language's
 * current lexicon. Returns a score in roughly [0, 1].
 *
 * Heuristic: penalises runs of consonants that never appear in the language
 * as a whole, and rewards CV alternation the language tends to favour.
 */
export function phonotacticFit(form: Phoneme[], lang: Language): number {
  if (form.length === 0) return 0;
  // Skip the bigram penalty for very small languages — they haven't yet
  // established their phonotactics, so we'd reject every candidate.
  const lexSize = Object.keys(lang.lexicon).length;
  const trustBigrams = lexSize >= 6;
  let cvHits = 0;
  let ccHits = 0;
  let badClusters = 0;
  let prevIsC = false;
  for (let i = 0; i < form.length; i++) {
    const isC = !isVowel(form[i]!);
    if (i > 0) {
      if (!prevIsC && !isC) cvHits++;
      else if (prevIsC && isC) ccHits++;
    }
    if (trustBigrams && prevIsC && isC) {
      const bigram = form[i - 1]! + form[i]!;
      if (!languageHasBigram(lang, bigram)) badClusters++;
    }
    prevIsC = isC;
  }
  const alternation = (cvHits + 1) / (cvHits + ccHits + 1);
  const clusterPenalty = trustBigrams ? Math.pow(0.7, badClusters) : 1;
  return alternation * clusterPenalty;
}

function languageHasBigram(lang: Language, bigram: string): boolean {
  for (const m of Object.keys(lang.lexicon)) {
    const form = lang.lexicon[m]!;
    for (let i = 0; i < form.length - 1; i++) {
      if (form[i]! + form[i + 1]! === bigram) return true;
    }
  }
  return false;
}
