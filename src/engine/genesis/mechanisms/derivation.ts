import type { CoinageMechanism } from "./types";
import type { WordForm } from "../../types";
import { phonotacticFit } from "../phonotactics";
import { otFit } from "../../phonology/ot";
import { relatedMeanings } from "../../semantics/clusters";

const SUFFIXES: ReadonlyArray<WordForm> = [
  ["e", "r"],
  ["n", "e", "s"],
  ["i", "k"],
  ["a", "l"],
  ["i", "n"],
];

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
    const paradigms = Object.values(lang.morphology.paradigms);
    const affixPool = paradigms
      .filter((p) => p && p.position === "suffix")
      .map((p) => p!.affix);
    const affix = affixPool.length > 0
      ? affixPool[rng.int(affixPool.length)]!
      : SUFFIXES[rng.int(SUFFIXES.length)]!;
    if (baseForm.length + affix.length > 10) return null;
    const form = [...baseForm, ...affix];
    const fit = 0.5 * phonotacticFit(form, lang) + 0.5 * otFit(form, lang);
    if (fit < 0.25) return null;
    return { form };
  },
};
