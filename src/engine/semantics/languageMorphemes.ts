/**
 * languageMorphemes.ts — Track C: a language's composable morpheme set with a semantic POINT and
 * a LIVE phonological form. Derived at read-time from the live lexicon (no baked data, no lexPoint
 * change) so a composition reflects the language's CURRENT stage of sound-change evolution.
 *
 * Roots = open-class content lexemes (point = the shared meaning anchor via lexPoint; form = live
 * lexGet). Affixes = lang.boundMorphemes (v1: zero point — a pure form affix; real operation
 * vectors are deferred to Track B per the Track C spec §7). The Morpheme shape matches
 * morphemeSpace.ts so nearestComposition (Track B) and the Dictionary consume it directly.
 *
 * Order: wordMorphemes preserves the recorded surface order (recordedParts → lang.compounds.parts):
 * a prefix derivation is [affix, base] (be-+hind), a suffix derivation / compound is [base, affix]
 * / [part, part] (dark+-ness, day+light).
 */
import type { Language, Meaning } from "../types";
import type { Morpheme, MorphemeType } from "./morphemeSpace";
import { zeroVec } from "./vec";
import { lexGet, lexIds, lexFormById } from "../lexicon/access";
import { meaningForLexemeId } from "../lexicon/lexemeIdentity";
import { recordedParts } from "../lexicon/word";
import { satGet } from "../lexicon/satellites";
import { posOf, isClosedClass } from "../lexicon/pos";
import { lexPoint } from "./meaningPoint";

function boundSet(lang: Language): ReadonlySet<string> {
  return lang.boundMorphemes ? new Set(lang.boundMorphemes) : new Set();
}

function affixType(affix: string): MorphemeType {
  return affix.endsWith("-") && !affix.startsWith("-") ? "prefix" : "suffix";
}

/** One morpheme entry (root or affix) with a LIVE form, or null if it has no usable form. */
function morphemeFor(lang: Language, id: string, bound: ReadonlySet<string>): Morpheme | null {
  const form = lexGet(lang, id);
  if (!form || form.length === 0) return null;
  if (bound.has(id)) {
    return { id, form: form.slice(), point: zeroVec(), type: affixType(id) };
  }
  return { id, form: form.slice(), point: lexPoint(id), type: "root" };
}

/** The language's composable morphemes: open-class content roots + bound affixes, live forms. */
export function languageMorphemes(lang: Language): Morpheme[] {
  const bound = boundSet(lang);
  const out: Morpheme[] = [];
  for (const lexId of lexIds(lang)) {
    const gloss = meaningForLexemeId(lang, lexId);
    if (gloss === undefined) continue;
    if (bound.has(gloss)) continue; // affixes added below, not as roots
    if (isClosedClass(posOf(gloss))) continue; // function words aren't composable content roots
    const form = lexFormById(lang, lexId);
    if (!form || form.length === 0) continue;
    out.push({ id: gloss, form: form.slice(), point: lexPoint(gloss), type: "root" });
  }
  for (const affix of bound) {
    const m = morphemeFor(lang, affix, bound);
    if (m) out.push(m);
  }
  return out;
}

/**
 * A word's ordered morpheme composition (live forms + points), or null if monomorphemic.
 * Prefers the live `compounds`/derivation structure (recordedParts); falls back to the engine-inert
 * `lang.etymology` ancestry (Track C seedEtymologies) for words whose synchronic form isn't a live
 * composition.
 */
export function wordMorphemes(lang: Language, meaning: Meaning): Morpheme[] | null {
  const parts = recordedParts(lang, meaning) ?? satGet(lang, "etymology", meaning) ?? null;
  if (!parts || parts.length === 0) return null;
  const bound = boundSet(lang);
  const out: Morpheme[] = [];
  for (const p of parts) {
    const m = morphemeFor(lang, p, bound);
    if (!m) return null; // a missing part means we can't faithfully show the composition
    out.push(m);
  }
  return out;
}
