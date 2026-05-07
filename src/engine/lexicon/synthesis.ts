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
import { CONCEPTS } from "./concepts";

export interface SynthesisResult {
  form: WordForm;
  parts: Array<{ meaning: Meaning; form: WordForm }>;
  glossNote: string;
  resolution: "synth-affix" | "synth-neg-affix" | "synth-concept";
}

/**
 * Phase 47 T3: tags treated as negational prefixes. They fire on a
 * separate (later) resolveLemma rung from the standard agentive /
 * abstractive synthesis, so a stem-without-negation derivation always
 * wins when both could apply. Models the linguistic reality that
 * negational affixes are productive but more constrained than
 * deriving suffixes (English "unhappy" is real but rarer than primary
 * "sad").
 */
const NEGATIONAL_TAGS: ReadonlySet<string> = new Set([
  "un-", "dis-", "non-", "in-", "anti-", "de-",
]);

function isNegationalTag(tag: string): boolean {
  return NEGATIONAL_TAGS.has(tag);
}

export type SynthesisMode = "non-neg" | "neg";

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
  mode: SynthesisMode = "non-neg",
): SynthesisResult | null {
  const affixes = lang.derivationalSuffixes;
  if (!affixes || affixes.length === 0) return null;

  // Sort productive affixes by english-orthographic length descending
  // for greedy longest-match. Non-productive affixes are excluded
  // entirely — matches generative-morphology theory. The mode
  // partitions the productive set into negational vs non-negational:
  //   - "non-neg" (rung 4): excludes NEGATIONAL_TAGS
  //   - "neg" (rung 5): includes only NEGATIONAL_TAGS, fires after
  //     non-neg returned null so negational prefixes are strictly rare.
  const candidates = affixes
    .filter((s): s is DerivationalSuffix & { productive: true } => s.productive === true)
    .filter((s) => mode === "neg" ? isNegationalTag(s.tag) : !isNegationalTag(s.tag))
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

    return {
      form,
      parts,
      glossNote,
      resolution: mode === "neg" ? "synth-neg-affix" : "synth-affix",
    };
  }
  return null;
}

/**
 * Phase 47 T6: cross-linguistic concept decomposition.
 *
 * When the lemma isn't lexicalised in the language and morphological
 * synthesis returned null, look up the concept's default
 * decomposition from CONCEPTS[lemma].decomposition. If all parts are
 * present in the language's lexicon, compose by concatenation.
 *
 * Distinct from per-language seedCompounds (T5): this fires for
 * concepts that have a CROSS-LINGUISTIC default decomposition,
 * applicable to any language whose lexicon happens to lack the
 * concept. seedCompounds are language-specific overrides.
 *
 * Primitives (Concept.primitive === true) are never decomposed even
 * if they have a decomposition field — matches NSM theory that
 * conceptual primes are irreducible.
 */
export function attemptConceptDecomposition(
  lang: Language,
  lemma: string,
): SynthesisResult | null {
  const concept = CONCEPTS[lemma];
  if (!concept) return null;
  if (concept.primitive) return null;
  const decomposition = concept.decomposition;
  if (!decomposition || decomposition.length === 0) return null;

  const partForms: Array<{ meaning: Meaning; form: WordForm }> = [];
  for (const partMeaning of decomposition) {
    const f = lang.lexicon[partMeaning];
    if (!f || f.length === 0) return null;
    partForms.push({ meaning: partMeaning, form: f.slice() });
  }

  const composed: WordForm = [];
  for (const p of partForms) composed.push(...p.form);

  return {
    form: composed,
    parts: partForms,
    glossNote: `compose: ${decomposition.join(" + ")}`,
    resolution: "synth-concept",
  };
}
