import type { Language, Phoneme, WordForm } from "../types";
import type { Paradigm, MorphCategory } from "./types";
import { harmonizeAffix } from "./harmony";
import { genderOf } from "./gender";
import { reduplicate } from "./reduplication";

/**
 * Phase 52 T1: morphology-application abstraction.
 *
 * `applyParadigm(stem, paradigm, lang?, meaning?)` is the single entry
 * point for "given this stem and this paradigm, produce the inflected
 * form." It dispatches on paradigm shape so callers don't need to know
 * whether the paradigm is concatenative (prefix/suffix), infixing,
 * circumfixing, templatic, reduplicative, ablauting, or zero-derivation.
 *
 * Today the dispatcher only handles `position: "prefix" | "suffix"`
 * (concat) — same behaviour as the old inline branch in
 * `morphology/evolve.ts:inflect`. Phase 52 T2 extends the dispatcher
 * with non-concatenative kinds. Phase 52 T1 is a pure refactor: every
 * caller routes through this function so future extensions to
 * morphological types affect every code path uniformly.
 *
 * Suppletion (per-meaning, per-category irregular forms) lives in
 * `inflect()` — it's a meaning-level lookup that overrides paradigm
 * application entirely. Module-gating ("isolating languages skip
 * paradigms entirely") also stays in `inflect()`. This keeps
 * `applyParadigm` purely about TURN-A-STEM-INTO-A-FORM-VIA-A-PARADIGM.
 */
export function applyParadigm(
  stem: WordForm,
  paradigm: Paradigm,
  lang?: Language,
  meaning?: string,
): WordForm {
  const kind = paradigm.kind ?? "affix";
  // Phase 52 T2: dispatch on paradigm kind. Each branch is a small,
  // self-contained morphological operation. Non-affix kinds skip the
  // variant + harmony pipeline because they don't concatenate; their
  // shape is built from the stem itself or a fixed pattern.
  switch (kind) {
    case "conversion":
      return stem.slice();
    case "reduplicate":
      return reduplicate(stem, paradigm.reduplication ?? "full");
    case "ablaut":
      return applyAblaut(stem, paradigm.ablautMap ?? {});
    case "template":
      return applyTemplate(
        stem,
        paradigm.templatePattern ?? "CVCVC",
        paradigm.templateVowel ?? "i",
      );
    case "circumfix":
      return applyCircumfix(
        stem,
        pickAffixVariant(paradigm, stem, lang, meaning),
      );
    case "infix":
      return applyInfix(
        stem,
        pickAffixVariant(paradigm, stem, lang, meaning),
        paradigm.insertionPoint ?? "after-first-V",
      );
    case "affix":
    default: {
      let affix: Phoneme[] = pickAffixVariant(paradigm, stem, lang, meaning);
      if (lang?.grammar.harmony && lang.grammar.harmony !== "none") {
        affix = harmonizeAffix(affix, stem, lang.grammar.harmony);
      }
      if (paradigm.position === "prefix") return [...affix, ...stem];
      return [...stem, ...affix];
    }
  }
}

/**
 * Phase 52 T2: insert affix at a structural landmark in the stem.
 * Insertion points are coarse but cover the productive cross-linguistic
 * cases: post-first-vowel (Tagalog `-um-`), pre-last-vowel, pre-last-
 * consonant. Returns prefix-concat as a fallback when the landmark
 * isn't found (e.g., a single-segment stem).
 */
function applyInfix(
  stem: WordForm,
  affix: Phoneme[],
  insertionPoint: NonNullable<Paradigm["insertionPoint"]>,
): WordForm {
  const splitIdx = findInsertionIndex(stem, insertionPoint);
  if (splitIdx < 0) return [...affix, ...stem];
  return [...stem.slice(0, splitIdx), ...affix, ...stem.slice(splitIdx)];
}

function findInsertionIndex(
  stem: WordForm,
  point: NonNullable<Paradigm["insertionPoint"]>,
): number {
  switch (point) {
    case "after-first-V": {
      for (let i = 0; i < stem.length; i++) {
        if (isVowelLike(stem[i]!)) return i + 1;
      }
      return -1;
    }
    case "before-last-V": {
      for (let i = stem.length - 1; i >= 0; i--) {
        if (isVowelLike(stem[i]!)) return i;
      }
      return -1;
    }
    case "before-last-C": {
      for (let i = stem.length - 1; i >= 0; i--) {
        if (!isVowelLike(stem[i]!)) return i;
      }
      return -1;
    }
  }
}

/**
 * Phase 52 T2: split a circumfix affix on the literal `_` separator
 * into prefix + suffix halves and wrap the stem. `["g","e","_","t"]`
 * means `ge` is prepended, `t` is appended → `ge<stem>t`. If no
 * separator exists, falls back to plain prefix concat.
 */
function applyCircumfix(stem: WordForm, affix: Phoneme[]): WordForm {
  const sepIdx = affix.indexOf("_");
  if (sepIdx < 0) return [...affix, ...stem];
  const pre = affix.slice(0, sepIdx);
  const post = affix.slice(sepIdx + 1);
  return [...pre, ...stem, ...post];
}

/**
 * Phase 52 T2: vowel-mutation paradigm. Walks the stem and replaces
 * each phoneme in `ablautMap`'s keys with its mapped value. Used for
 * Germanic strong-verb ablaut (sing → sang via `{i: a}`).
 */
function applyAblaut(stem: WordForm, ablautMap: Record<string, string>): WordForm {
  return stem.map((p) => ablautMap[p] ?? p);
}

/**
 * Phase 52 T2: Semitic-style root-template interleaving. Treats the
 * stem as the root consonants and fills the pattern's `C` slots
 * left-to-right with those consonants; `V` slots get `vowel`. Other
 * pattern characters are passed through verbatim. Falls back to the
 * stem unchanged if the pattern lacks enough `C` slots.
 *
 * Example: stem `["k","t","b"]`, pattern `"CaCiC"`, vowel `"i"` →
 * `["k","a","t","i","b"]`.
 */
function applyTemplate(stem: WordForm, pattern: string, vowel: string): WordForm {
  const consonants = stem.filter((p) => !isVowelLike(p));
  if (consonants.length === 0) return stem.slice();
  const out: Phoneme[] = [];
  let cIdx = 0;
  for (const ch of pattern) {
    if (ch === "C") {
      if (cIdx >= consonants.length) return stem.slice();
      out.push(consonants[cIdx]!);
      cIdx++;
    } else if (ch === "V") {
      out.push(vowel);
    } else {
      out.push(ch);
    }
  }
  return out;
}

/**
 * Convenience: apply a sequence of paradigms in cascade order. This
 * was previously inline in `inflectCascade` — exposed here so any
 * caller can stack paradigms without re-implementing the loop.
 */
export function applyParadigmStack(
  stem: WordForm,
  categories: readonly MorphCategory[],
  lang: Language,
  meaning: string,
): WordForm {
  let form = stem;
  for (const cat of categories) {
    const p = lang.morphology.paradigms[cat];
    if (!p) continue;
    form = applyParadigm(form, p, lang, meaning);
  }
  return form;
}

/**
 * Phase 30+ paradigm-variant selection. Picks the right affix when a
 * paradigm has gender-conditioned, class-conditioned, or stem-shape-
 * conditioned variants. Pre-Phase-52 this lived inside `evolve.ts` as
 * a private helper; moved here so apply.ts is the single source of
 * truth for paradigm-application logic.
 */
export function pickAffixVariant(
  paradigm: Paradigm,
  base: WordForm,
  lang?: Language,
  meaning?: string,
): WordForm {
  const variants = paradigm.variants;
  if (!variants || variants.length === 0) return paradigm.affix;

  // Gender-conditioned variant takes precedence when applicable.
  if (lang && meaning && (lang.grammar.genderCount ?? 0) > 0) {
    const g = genderOf(lang, meaning);
    const genderMatch = variants.find((v) => v.when === `gender:${g}`);
    if (genderMatch) return genderMatch.affix;
  }

  const last = base[base.length - 1];
  if (!last) return paradigm.affix;
  const isVowelFinal = isVowelLike(last);
  const want: "vowel-final" | "consonant-final" = isVowelFinal
    ? "vowel-final"
    : "consonant-final";
  const match = variants.find((v) => v.when === want);
  return match ? match.affix : paradigm.affix;
}

export function isVowelLike(p: string): boolean {
  const base = p.replace(/[ːˈˌ˥˧˩]/g, "");
  if (base.length === 0) return false;
  return /^[aeiouɛɔəɨɯøyœæáéíóúàèìòùâêîôûāēīōūãẽĩõũ]/i.test(base);
}
