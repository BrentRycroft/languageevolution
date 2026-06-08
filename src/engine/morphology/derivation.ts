import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";
import { applyParadigm } from "./apply";
import { lexGet, lexHas } from "../lexicon/access";
import { evolvableLexemes, isKeyless, keylessMature, effectiveGlossFor } from "../lexicon/evolvable";
import type { LexemeId } from "../lexicon/lexemeIdentity";
import { recordedParts } from "../lexicon/word";

/**
 * The stored derivational-suffix shape on a Language. Differs from
 * `lexicon/derivation.ts`'s `DerivationalSuffix` only in that `category`
 * is optional here (legacy untyped suffixes), so we key off the actual
 * `Language` field type rather than the canonical interface.
 */
type StoredSuffix = NonNullable<Language["derivationalSuffixes"]>[number];

/**
 * Phase 66 T2: runtime productive derivation.
 *
 * Speakers emit ad-hoc derived forms ("googler", "samba-zo") whenever
 * a productive affix attaches to a stem in their grammar — even
 * when the derived meaning isn't lexically attested. The simulator's
 * narrative pipeline previously restricted itself to lexicon entries
 * that had been formally coined via the genesis loop. This module
 * exposes a transient form-building hook so narrative emission can
 * use a productive derived form without polluting the lexicon.
 *
 * Two entry points:
 *   1. `tryDerivedFormFromMeaning(lang, meaning)` — when a meaning
 *      looks like `${base}-${suffixTag}` (e.g. "see-agt"), build the
 *      derived form by applying the matching productive suffix to
 *      `base`'s lexicon form. Returns null if base or suffix isn't
 *      available.
 *   2. `pickRuntimeDerivedMeaning(lang, rng)` — opportunistically
 *      pick a base verb / adjective / noun and a productive suffix,
 *      and return the synthesised meaning string and form. Used by
 *      narrative slot-fill to occasionally inject a derived
 *      candidate alongside attested vocabulary.
 *
 * Productive suffixes register themselves in
 * `lang.derivationalSuffixes[].productive` (Phase 22+). This module
 * filters to those.
 */

export interface RuntimeDerivedMeaning {
  meaning: Meaning;
  form: WordForm;
  baseMeaning: Meaning;
  suffixTag: string;
}

const SUFFIX_TAG_TO_MORPH_CATEGORY: Record<string, string> = {
  agt: "noun.case.nom",
  nmlz: "noun.case.nom",
  abs: "noun.case.nom",
  dim: "noun.case.nom",
  adj: "noun.case.nom",
  dom: "noun.case.nom",
};

/**
 * Phase 66 T2: decompose a `${base}-${suffixTag}` runtime-derived
 * meaning into its base lemma and the matching productive suffix.
 * Returns null when no productive suffix's tag matches the meaning's
 * tail. Tags can themselves start with "-" (e.g. "-er", "-ness"), so
 * we can't rely on splitting at the last dash — try every productive
 * suffix and pick the longest match. Shared by `tryDerivedFormFromMeaning`
 * (form synthesis) and the narrative composer (interlinear glossing).
 */
export function derivedMeaningParts(
  lang: Language,
  meaning: Meaning,
): { base: string; suffix: StoredSuffix } | null {
  if (!meaning.includes("-")) return null;
  const productive = (lang.derivationalSuffixes ?? []).filter((s) => s.productive);
  let best: { base: string; suffix: StoredSuffix } | null = null;
  for (const s of productive) {
    // The meaning is `${base}-${tag}` literal concat. So if the
    // meaning ends with `-${tag}`, the base is everything before.
    const want = `-${s.tag}`;
    if (meaning.endsWith(want)) {
      const base = meaning.slice(0, meaning.length - want.length);
      if (!base) continue;
      if (!best || s.tag.length > best.suffix.tag.length) {
        best = { base, suffix: s };
      }
    }
  }
  return best;
}

/**
 * Phase 66 T2: build a derived form on-the-fly when given a
 * `${base}-${suffixTag}` meaning. Returns null when the base or the
 * matching productive suffix isn't available.
 */
export function tryDerivedFormFromMeaning(
  lang: Language,
  meaning: Meaning,
): WordForm | null {
  const best = derivedMeaningParts(lang, meaning);
  if (!best) return null;
  const baseForm = lexGet(lang, best.base);
  if (!baseForm) return null;
  const pdm = {
    affix: best.suffix.affix,
    position: (best.suffix.position ?? "suffix") as "prefix" | "suffix",
    category: "noun.case.nom" as const,
  };
  return applyParadigm(baseForm, pdm, lang, best.base);
}

const VERB_HINTS = new Set([
  "go", "see", "eat", "drink", "speak", "make", "take", "give",
  "run", "walk", "sleep", "write", "read", "fight", "kill", "build",
  "find", "lose", "hold", "carry", "bring", "send", "fly", "swim",
]);

const ADJECTIVE_HINTS = new Set([
  "big", "small", "good", "bad", "new", "old", "long", "short",
  "hot", "cold", "wet", "dry", "young", "happy", "sad", "free",
  "kind", "wise", "strong", "weak", "tall",
]);

/**
 * Phase 66 T2: pick a runtime derivation candidate. Walks productive
 * suffixes; for each, picks a compatible base lemma in the lexicon;
 * synthesises a transient meaning + form. Returns null if no
 * productive suffix or compatible base exists.
 */
/**
 * S2b: is `id` an eligible derivation BASE? Suffix-independent eligibility — not an already-structured
 * compound/derivation and not a bound morpheme — plus the keyless maturity gate (derivation is
 * concept-coupled). The suffix-dependent hint filters stay at the call site. For a SEEDED id this is
 * the pre-S2b `recordedParts === null && !boundMorphemes.has` filter (effectiveGlossFor = stored gloss).
 */
export function derivationBaseEligible(lang: Language, id: LexemeId): boolean {
  if (isKeyless(lang, id) && !keylessMature(lang, id)) return false;
  const m = effectiveGlossFor(lang, id);
  return recordedParts(lang, m) === null && !lang.boundMorphemes?.has(m);
}

export function pickRuntimeDerivedMeaning(
  lang: Language,
  rng: Rng,
): RuntimeDerivedMeaning | null {
  const productive = (lang.derivationalSuffixes ?? []).filter(
    (s) => s.productive,
  );
  if (productive.length === 0) return null;
  const suffix = productive[rng.int(productive.length)]!;
  const wantsVerb =
    suffix.category === "agentive" || suffix.category === "nominalisation";
  const wantsAdj = suffix.category === "abstractNoun";
  // S2b: iterate evolvable ids (seeded first, keyless appended); resolve each id's effective gloss as
  // the base `m`. derivationBaseEligible carries the suffix-independent filters incl. the keyless
  // maturity gate; the suffix-dependent hint filters stay inline. Seeded set/order is unchanged.
  const candidates: string[] = [];
  for (const id of evolvableLexemes(lang)) {
    if (!derivationBaseEligible(lang, id)) continue;
    const m = effectiveGlossFor(lang, id);
    if (lexHas(lang, `${m}-${suffix.tag}`)) continue;
    if (wantsVerb && !VERB_HINTS.has(m)) continue;
    if (wantsAdj && !ADJECTIVE_HINTS.has(m)) continue;
    if (!wantsVerb && !wantsAdj && (VERB_HINTS.has(m) || ADJECTIVE_HINTS.has(m))) continue;
    candidates.push(m);
  }
  if (candidates.length === 0) return null;
  const base = candidates[rng.int(candidates.length)]!;
  const meaning = `${base}-${suffix.tag}`;
  const form = tryDerivedFormFromMeaning({ ...lang } as Language, meaning);
  if (!form) return null;
  // Nudge the productive suffix's usage count so the runtime
  // emission feeds back into the next gen's coinage prioritisation.
  suffix.usageCount = (suffix.usageCount ?? 0) + 1;
  return { meaning, form, baseMeaning: base, suffixTag: suffix.tag };
}

/**
 * Convenience for tests: void the unused-import warning.
 */
export const __SUFFIX_TAG_MAP = SUFFIX_TAG_TO_MORPH_CATEGORY;
