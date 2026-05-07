/**
 * Phase 47 (T1): on-demand morphological synthesis.
 *
 * When the user asks the translator for a lemma that isn't in
 * `lang.lexicon` and isn't a known compound, this module attempts to
 * decompose the lemma into stem + recognised productive affix and
 * compose the surface form by concatenation.
 *
 * Example: typing "lighter" against an English-style language whose
 * lexicon has "light" and whose `derivationalSuffixes` contains a
 * productive `-er.agt` entry → returns { form: light + -er.agt, parts:
 * [light, -er.agt], glossNote: "light + -er.agt" }.
 *
 * Productivity gate: only fires when the candidate suffix has
 * `productive === true` (the existing flag in derivation.ts). Fresh
 * languages with `usageCount: 0` won't synthesise — matches generative
 * morphology + Pinker's "Words and Rules" view that productive rules
 * fire only after attestation.
 *
 * No caching: synthesis is recomputed on every call. Caching into
 * `lang.lexicon` would risk the "-er-er" pyramid in
 * `attemptProductiveDerivation` (`targetedDerivation.ts:112`'s
 * `m.includes("-")` skip) and would force sound-change to walk
 * speculative entries.
 *
 * Recursion: depth-1 only in this tranche. Depth-2 ("lighterness" →
 * light + -er + -ness) is reserved for T2.
 */

import type { Language, WordForm, Meaning } from "../types";
import type { DerivationalSuffix } from "./derivation";

export interface SynthesisResult {
  form: WordForm;
  parts: Array<{ meaning: Meaning; form: WordForm }>;
  glossNote: string;
  resolution: "synth-affix";
}

/**
 * Strip the tag's leading hyphen and any disambiguator suffix
 * (".agt" → "", ".abst" → "") to recover the English-orthographic
 * form that should match the input lemma.
 *
 *   "-er.agt" → "er"
 *   "-ness" → "ness"
 *   "-dom" → "dom"
 */
function tagToEnglishSuffix(tag: string): string {
  return tag.replace(/^-/, "").replace(/\..+$/, "");
}

/**
 * Try to decompose `lemma` as stem + suffix, where the suffix is one
 * of the language's productive `derivationalSuffixes`. Returns null
 * when no decomposition fits.
 *
 * Greedy longest-match: tries the longest English-orthographic suffix
 * first (e.g., "-ness" before "-er"). The first productive suffix
 * whose stripped lemma yields a stem present in the lexicon wins.
 */
export function attemptMorphologicalSynthesis(
  lang: Language,
  lemma: string,
): SynthesisResult | null {
  const suffixes = lang.derivationalSuffixes;
  if (!suffixes || suffixes.length === 0) return null;

  // Sort productive suffixes by english-orthographic length descending
  // for greedy longest-match. Non-productive suffixes are excluded
  // entirely — matches generative-morphology theory.
  const candidates = suffixes
    .filter((s): s is DerivationalSuffix & { productive: true } => s.productive === true)
    .map((s) => ({ suffix: s, eng: tagToEnglishSuffix(s.tag) }))
    .filter(({ eng }) => eng.length > 0)
    .sort((a, b) => b.eng.length - a.eng.length);

  for (const { suffix, eng } of candidates) {
    if (!lemma.endsWith(eng)) continue;
    if (lemma.length <= eng.length) continue;
    const stem = lemma.slice(0, lemma.length - eng.length);
    const stemForm = lang.lexicon[stem];
    if (!stemForm || stemForm.length === 0) continue;
    if (!suffix.affix || suffix.affix.length === 0) continue;
    return {
      form: [...stemForm, ...suffix.affix],
      parts: [
        { meaning: stem, form: stemForm.slice() },
        { meaning: suffix.tag, form: suffix.affix.slice() },
      ],
      glossNote: `${stem} + ${suffix.tag}`,
      resolution: "synth-affix",
    };
  }
  return null;
}
