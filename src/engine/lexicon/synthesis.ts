/**
 * Phase 47 (T1) / Phase 49: on-demand morphological synthesis.
 *
 * Two-phase architecture (Phase 49):
 *   1. Input parser (`parseEnglishAffix`) maps the typed lemma onto a
 *      `DerivationCategory` + position. English-biased on purpose:
 *      it's the keyboard-side dictionary, not a property of the
 *      simulated language.
 *   2. Output selector (`selectAffixForCategory`) is language-
 *      agnostic: given a category + stem, picks the productive affix
 *      in `lang.derivationalSuffixes` whose concatenation scores best
 *      on phonological fit (OT + boundary markedness).
 *
 * The legacy literal-tag path (Phase 47 T1-T3) remains as a fallback
 * so seedCompounds that explicitly reference tag strings (e.g.
 * "-er.agt") still resolve. New code should prefer the category path.
 *
 * Productivity gate: only productive affixes fire — matches generative
 * morphology + Pinker's "Words and Rules" view that productive rules
 * apply only after attestation.
 *
 * No caching: synthesis is recomputed on every call. Caching into
 * `lang.lexicon` would risk an "-er-er" pyramid via the genesis
 * loop's `m.includes("-")` skip and would force sound-change to walk
 * speculative entries.
 *
 * Recursion: depth-1 only. Depth-2 ("lighterness" → light + -er +
 * -ness) is deferred per Phase 47 / Phase 49.
 */

import type { Language, WordForm, Meaning } from "../types";
import type { DerivationalSuffix, DerivationCategory } from "./derivation";
import { CONCEPTS } from "./concepts";
import { relatedMeanings } from "../semantics/clusters";
import { frequencyFor } from "./frequency";
import { parseEnglishAffix } from "../translator/englishAffixes";
import { selectAffixForCategory } from "./affixSelector";

export interface SynthesisResult {
  form: WordForm;
  parts: Array<{ meaning: Meaning; form: WordForm }>;
  glossNote: string;
  resolution: "synth-affix" | "synth-neg-affix" | "synth-concept" | "synth-cluster";
}

/**
 * Phase 47 T9: small-lexicon eligibility for cluster-emergent
 * composition. Models the linguistic reality that small-lexicon
 * languages (Pidgins, Creoles, isolating typology like Toki Pona)
 * routinely express complex meanings via ad-hoc compositions, while
 * mature large-lexicon languages lexicalise instead. The threshold is
 * conservative: only fires for languages with <200 active lemmas OR
 * synthesisIndex below 0.4 (extreme isolating).
 */
function smallLexiconEligible(lang: Language): boolean {
  const lexSize = Object.keys(lang.lexicon).length;
  const synth = lang.grammar.synthesisIndex ?? 0.5;
  return lexSize < 200 || synth < 0.4;
}

/**
 * Phase 47 T3 / Phase 49: categories treated as negational. The two-
 * pass synthesis at `resolveLemma` rungs 4 and 5 partitions on this
 * set: rung 4 fires non-negational categories first, rung 5 fires
 * negational only after non-negational returned null. Models the
 * linguistic reality that negational affixes are productive but more
 * constrained than deriving suffixes (English "unhappy" is real but
 * rarer than primary "sad").
 *
 * Phase 49: replaces the per-tag `NEGATIONAL_TAGS` set — the
 * partition is now category-based, so any language whose surface
 * realisation of `negative` is e.g. a circumfix or a non-Latinate
 * prefix correctly fires on the negational rung.
 */
const NEGATIONAL_CATEGORIES: ReadonlySet<DerivationCategory> = new Set<DerivationCategory>([
  "negative",
]);

function isNegationalCategory(c: DerivationCategory | undefined): boolean {
  return c !== undefined && NEGATIONAL_CATEGORIES.has(c);
}

/**
 * Phase 49: legacy fallback list for the literal-tag path. Old
 * presets / seedCompounds may reference tag strings like "un-" /
 * "dis-" without a `category` field on the entry; we partition those
 * by surface tag the way Phase 47 did. New seeded entries go through
 * the category-driven path and ignore this list.
 */
const LEGACY_NEGATIONAL_TAGS: ReadonlySet<string> = new Set([
  "un-", "dis-", "non-", "in-", "anti-", "de-",
]);

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
 *
 * @deprecated Phase 49: use `parseEnglishAffix` (in
 * translator/englishAffixes.ts) for input-side dispatch and
 * `selectAffixForCategory` for output-side selection. This helper is
 * retained only for the legacy literal-tag fallback, which still
 * resolves seedCompounds that reference tag strings directly.
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
 * Try to decompose `lemma` into stem + recognised affix. Phase 49 runs
 * the input through `parseEnglishAffix` (English-biased input dict)
 * to get an abstract `DerivationCategory`, then asks the language's
 * own affix table for the best-fitting realisation. When the parser
 * doesn't recognise the lemma OR the language has no affix in the
 * requested category, falls back to the Phase 47 literal-tag path
 * for back-compat with seedCompounds and untyped (legacy) suffixes.
 *
 * The mode partitions:
 *   - "non-neg" (rung 4): skips entries whose category is in
 *     NEGATIONAL_CATEGORIES (legacy tags: LEGACY_NEGATIONAL_TAGS).
 *   - "neg" (rung 5): only fires for those entries.
 */
export function attemptMorphologicalSynthesis(
  lang: Language,
  lemma: string,
  mode: SynthesisMode = "non-neg",
): SynthesisResult | null {
  const affixes = lang.derivationalSuffixes;
  if (!affixes || affixes.length === 0) return null;

  // Phase 49: category-driven path. Recognise the affix on the input
  // side, dispatch the realisation choice to the language's own
  // table.
  const parsed = parseEnglishAffix(lemma);
  if (parsed) {
    const isNeg = isNegationalCategory(parsed.category);
    if ((mode === "neg") === isNeg) {
      for (const candidateStem of parsed.candidateStems) {
        const stemForm = lang.lexicon[candidateStem];
        if (!stemForm || stemForm.length === 0) continue;
        const picked = selectAffixForCategory(
          lang, parsed.category, stemForm, parsed.position,
        );
        if (!picked) continue;
        const form = picked.position === "suffix"
          ? [...stemForm, ...picked.affix]
          : [...picked.affix, ...stemForm];
        const glossNote = picked.position === "suffix"
          ? `${candidateStem} + ${picked.tag}`
          : `${picked.tag} + ${candidateStem}`;
        const parts = picked.position === "suffix"
          ? [
              { meaning: candidateStem, form: stemForm.slice() },
              { meaning: picked.tag, form: picked.affix.slice() },
            ]
          : [
              { meaning: picked.tag, form: picked.affix.slice() },
              { meaning: candidateStem, form: stemForm.slice() },
            ];
        return {
          form,
          parts,
          glossNote,
          resolution: mode === "neg" ? "synth-neg-affix" : "synth-affix",
        };
      }
    }
  }

  // Phase 47 legacy fallback: literal-tag matching. Productive affixes
  // sorted by surface length descending for greedy longest-match.
  // Mode partition uses LEGACY_NEGATIONAL_TAGS by tag string.
  const candidates = affixes
    .filter((s): s is DerivationalSuffix & { productive: true } => s.productive === true)
    .filter((s) => mode === "neg"
      ? LEGACY_NEGATIONAL_TAGS.has(s.tag)
      : !LEGACY_NEGATIONAL_TAGS.has(s.tag))
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

/**
 * Phase 47 T9: cluster-emergent composition (last-resort fallback).
 *
 * For small-lexicon languages with no other resolution path, attempt
 * to compose the meaning from semantically-adjacent words already in
 * the lexicon. Uses semantic clusters + neighbors + concept-cluster
 * inference to score candidate part pairs.
 *
 * Gating (the user's "in some languages these concepts are
 * irreducible" caveat): fires ONLY for small-lexicon-eligible
 * languages. Large-lexicon languages (English, Romance) skip this
 * rung — their primary lexicalisations stay primary.
 *
 * Linguistic basis: matches Pidgin / Creole-style ad-hoc lexical fills
 * where speakers compose unknown concepts on the fly from available
 * vocabulary. Distinct from T6's CONCEPTS.decomposition path: T6 uses
 * authored cross-linguistic defaults; T9 emerges from the language's
 * own lexicon + cluster topology.
 */
export function attemptClusterComposition(
  lang: Language,
  lemma: string,
): SynthesisResult | null {
  if (!smallLexiconEligible(lang)) return null;
  const concept = CONCEPTS[lemma];
  if (!concept) return null;
  if (concept.primitive) return null;

  // Find candidate parts: cluster co-members + semantic neighbors,
  // filtered to those present in lang.lexicon (excluding the target
  // itself).
  const peers = relatedMeanings(lemma);
  const candidates: Array<{ meaning: Meaning; form: WordForm; freq: number }> = [];
  for (const peer of peers) {
    if (peer === lemma) continue;
    const f = lang.lexicon[peer];
    if (!f || f.length === 0) continue;
    candidates.push({ meaning: peer, form: f.slice(), freq: frequencyFor(peer) });
  }
  if (candidates.length < 2) return null;

  // Rank: prefer high-frequency primitives. Sort descending by freq.
  candidates.sort((a, b) => b.freq - a.freq);
  const a = candidates[0]!;
  const b = candidates[1]!;
  const composed: WordForm = [...a.form, ...b.form];

  return {
    form: composed,
    parts: [
      { meaning: a.meaning, form: a.form },
      { meaning: b.meaning, form: b.form },
    ],
    glossNote: `cluster: ${a.meaning} + ${b.meaning}`,
    resolution: "synth-cluster",
  };
}
