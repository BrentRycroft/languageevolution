import type { CoinageMechanism } from "./types";
import type { WordForm } from "../../types";
import { phonotacticFit } from "../phonotactics";
import { otFit } from "../../phonology/ot";
import { langPhonotacticScore } from "../../phonology/phonotactics";
import { relatedMeanings } from "../../semantics/clusters";
import { lexGet, lexHas, lexKeys } from "../../lexicon/access";

/**
 * Phase 53 T1: derivation now requires the language to actually carry
 * its own affix machinery. Pre-Phase-53 a hardcoded English-biased
 * SUFFIXES fallback (`-er, -ness, -ic, -al, -in`) fired whenever the
 * target language had no inflectional or derivational suffixes —
 * effectively imprinting English-shaped morphology on every coined
 * form, regardless of the target's typology. The user explicitly
 * called this out: coining should ground in the LANGUAGE'S own
 * lexemes + affixes, not in a foreign default. This mechanism now
 * returns null when the language has neither productive derivational
 * suffixes (Phase 49+) nor inflectional suffix paradigms; the
 * translator falls through to the literal-quote fallback.
 */
export const MECHANISM_DERIVATION: CoinageMechanism = {
  id: "mechanism.derivation",
  label: "A + affix → A'",
  originTag: "derivation",
  baseWeight: 1,
  tryCoin: (lang, target, _tree, rng) => {
    const related = relatedMeanings(target).filter((m) => lexHas(lang, m));
    const base =
      related.length > 0
        ? related[rng.int(related.length)]!
        : lexKeys(lang)[rng.int(lexKeys(lang).length)];
    if (!base) return null;
    const baseForm = lexGet(lang, base)!;
    // Realism #1 (productivity hierarchies; language-agnostic affix order):
    // derivation must follow the language's OWN affix typology, not assume a
    // suffix. A prefixing language (grammar.affixPosition === "prefix") derives
    // with a prefix (Bantu-style ki-, mu-); a suffixing one with a suffix
    // (Latin -tor, English -er). Pre-fix this filtered to suffixes only, so
    // prefixing languages either never derived or imprinted a foreign suffix.
    const position = lang.grammar.affixPosition;
    // Prefer the language's own productive derivational affixes (Phase 49+);
    // fall back to inflectional paradigm affixes in the SAME position; if
    // neither exists, refuse to coin rather than imprint a foreign default.
    const derivPool = (lang.derivationalSuffixes ?? [])
      .filter((s) => s.productive && (s.position ?? "suffix") === position)
      .map((s) => s.affix);
    const paradigmPool = Object.values(lang.morphology.paradigms)
      .filter((p) => p && p.position === position)
      .map((p) => p!.affix);
    const affixPool = derivPool.length > 0 ? derivPool : paradigmPool;
    if (affixPool.length === 0) return null;
    const affix = affixPool[rng.int(affixPool.length)]!;
    if (baseForm.length + affix.length > 10) return null;
    const form: WordForm =
      position === "prefix" ? [...affix, ...baseForm] : [...baseForm, ...affix];
    const fit = 0.5 * phonotacticFit(form, lang) + 0.5 * otFit(form, lang);
    if (fit < 0.25) return null;
    // Realism #1 (new words respect the language's syllable structure): reject
    // a derived form that grossly violates the declared phonotactic profile
    // (e.g. a CV-only language whose affix seam produces an illegal cluster).
    // genesis.ts repairs mild violations by epenthesis post-hoc; refusing the
    // gross cases keeps the seam honest so the repair stays light.
    if (langPhonotacticScore(lang, form) < 0.25) return null;
    return {
      form,
      sources: {
        partMeanings: [base],
        via: position === "prefix" ? `${affix.join("")}-` : `-${affix.join("")}`,
      },
    };
  },
};
