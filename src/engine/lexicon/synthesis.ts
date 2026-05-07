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
 * Strip the tag's leading/trailing hyphen and any disambiguator
 * suffix (".agt" → "", ".abst" → "") to recover the
 * English-orthographic form that should match the input lemma.
 *
 *   "-er.agt" → "er"
 *   "-ness" → "ness"
 *   "un-" → "un"
 *   "re-" → "re"
 */
function tagToEnglishForm(tag: string): string {
  return tag.replace(/^-|-$/g, "").replace(/\..+$/, "");
}

/**
 * Phase 47 T2: derive position from the tag shape when not explicitly
 * declared. Tags ending with "-" are prefixes; tags starting with "-"
 * (or with no hyphen, e.g. seeded suffixes) are suffixes.
 */
function affixPosition(suffix: { tag: string; position?: "prefix" | "suffix" }): "prefix" | "suffix" {
  if (suffix.position) return suffix.position;
  if (suffix.tag.endsWith("-") && !suffix.tag.startsWith("-")) return "prefix";
  return "suffix";
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
  const affixes = lang.derivationalSuffixes;
  if (!affixes || affixes.length === 0) return null;

  // Sort productive affixes by english-orthographic length descending
  // for greedy longest-match. Non-productive affixes are excluded
  // entirely — matches generative-morphology theory.
  const candidates = affixes
    .filter((s): s is DerivationalSuffix & { productive: true } => s.productive === true)
    .map((s) => ({
      affix: s,
      eng: tagToEnglishForm(s.tag),
      position: affixPosition(s),
    }))
    .filter(({ eng }) => eng.length > 0)
    .sort((a, b) => b.eng.length - a.eng.length);

  for (const { affix, eng, position } of candidates) {
    if (!affix.affix || affix.affix.length === 0) continue;

    let stem: string;
    if (position === "suffix") {
      if (!lemma.endsWith(eng)) continue;
      if (lemma.length <= eng.length) continue;
      stem = lemma.slice(0, lemma.length - eng.length);
    } else {
      if (!lemma.startsWith(eng)) continue;
      if (lemma.length <= eng.length) continue;
      stem = lemma.slice(eng.length);
    }

    const stemForm = lang.lexicon[stem];
    if (!stemForm || stemForm.length === 0) continue;

    const form = position === "suffix"
      ? [...stemForm, ...affix.affix]
      : [...affix.affix, ...stemForm];
    const glossNote = position === "suffix"
      ? `${stem} + ${affix.tag}`
      : `${affix.tag} + ${stem}`;
    const parts = position === "suffix"
      ? [
          { meaning: stem, form: stemForm.slice() },
          { meaning: affix.tag, form: affix.affix.slice() },
        ]
      : [
          { meaning: affix.tag, form: affix.affix.slice() },
          { meaning: stem, form: stemForm.slice() },
        ];

    return { form, parts, glossNote, resolution: "synth-affix" };
  }
  return null;
}
