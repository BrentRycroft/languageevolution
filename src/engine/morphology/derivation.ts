import type { Language, Meaning, WordForm } from "../types";
import type { Rng } from "../rng";
import { applyParadigm } from "./apply";

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
 * Phase 66 T2: build a derived form on-the-fly when given a
 * `${base}-${suffixTag}` meaning. Returns null when the base or the
 * matching productive suffix isn't available.
 */
export function tryDerivedFormFromMeaning(
  lang: Language,
  meaning: Meaning,
): WordForm | null {
  if (!meaning.includes("-")) return null;
  // Match the full registered suffix tag at the end of the meaning.
  // Tags can themselves start with "-" (e.g. "-er", "-ness"), so we
  // can't rely on splitting at the last dash. Try every productive
  // suffix and pick the longest match.
  const productive = (lang.derivationalSuffixes ?? []).filter((s) => s.productive);
  let best: { suffix: typeof productive[0]; base: string } | null = null;
  for (const s of productive) {
    const tag = s.tag;
    // The meaning is `${base}-${tag}` literal concat. So if the
    // meaning ends with `-${tag}`, the base is everything before.
    const want = `-${tag}`;
    if (meaning.endsWith(want)) {
      const base = meaning.slice(0, meaning.length - want.length);
      if (!base) continue;
      if (!best || tag.length > best.suffix.tag.length) {
        best = { suffix: s, base };
      }
    }
  }
  if (!best) return null;
  const baseForm = lang.lexicon[best.base];
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
  const allMeanings = Object.keys(lang.lexicon);
  const candidates = allMeanings.filter((m) => {
    if (m.includes("-")) return false;
    if (lang.lexicon[`${m}-${suffix.tag}`]) return false;
    if (wantsVerb && !VERB_HINTS.has(m)) return false;
    if (wantsAdj && !ADJECTIVE_HINTS.has(m)) return false;
    if (!wantsVerb && !wantsAdj && (VERB_HINTS.has(m) || ADJECTIVE_HINTS.has(m))) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const base = candidates[rng.int(candidates.length)]!;
  const meaning = `${base}-${suffix.tag}`;
  const form = tryDerivedFormFromMeaning({ ...lang, lexicon: lang.lexicon } as Language, meaning);
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
