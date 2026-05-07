import type { CoinageMechanism } from "./types";
import { phonotacticFit } from "../phonotactics";
import { otFit } from "../../phonology/ot";
import { relatedMeanings } from "../../semantics/clusters";

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
    const related = relatedMeanings(target).filter((m) => lang.lexicon[m]);
    const base =
      related.length > 0
        ? related[rng.int(related.length)]!
        : Object.keys(lang.lexicon)[rng.int(Object.keys(lang.lexicon).length)];
    if (!base) return null;
    const baseForm = lang.lexicon[base]!;
    // Prefer the language's own productive derivational affixes
    // (Phase 49+); fall back to inflectional suffix paradigms; if
    // neither exists, refuse to coin rather than imprint a foreign
    // default.
    const derivPool = (lang.derivationalSuffixes ?? [])
      .filter((s) => s.productive && (s.position ?? "suffix") === "suffix")
      .map((s) => s.affix);
    const paradigmPool = Object.values(lang.morphology.paradigms)
      .filter((p) => p && p.position === "suffix")
      .map((p) => p!.affix);
    const affixPool = derivPool.length > 0 ? derivPool : paradigmPool;
    if (affixPool.length === 0) return null;
    const affix = affixPool[rng.int(affixPool.length)]!;
    if (baseForm.length + affix.length > 10) return null;
    const form = [...baseForm, ...affix];
    const fit = 0.5 * phonotacticFit(form, lang) + 0.5 * otFit(form, lang);
    if (fit < 0.25) return null;
    return {
      form,
      sources: { partMeanings: [base], via: `-${affix.join("")}` },
    };
  },
};
