import type { Morphology, MorphCategory, Paradigm } from "./types";
import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";

export interface MorphShift {
  kind: "affix_erode" | "category_merge" | "grammaticalization";
  description: string;
}

/**
 * Apply sound change to each paradigm's affix. Assumes the same change-application
 * logic handled the lexicon already; the caller passes a function that transforms
 * a WordForm. This keeps morphology in sync with phonology.
 */
export function applyPhonologyToAffixes(
  morph: Morphology,
  mutate: (form: WordForm) => WordForm,
): void {
  for (const cat of Object.keys(morph.paradigms) as MorphCategory[]) {
    const pdm = morph.paradigms[cat];
    if (!pdm) continue;
    pdm.affix = mutate(pdm.affix);
  }
}

/**
 * Rare: a common lexeme transitions into a grammatical affix.
 * Returns a description of the shift, or null if nothing happened.
 */
export function maybeGrammaticalize(
  lang: Language,
  rng: Rng,
  probability: number,
): MorphShift | null {
  if (!rng.chance(probability)) return null;
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length === 0) return null;
  // Pick a high-frequency meaning that doesn't already correspond to a paradigm.
  const candidate = meanings[rng.int(meanings.length)]!;
  const form = lang.lexicon[candidate]!;
  if (form.length === 0 || form.length > 3) return null;
  const freq = lang.wordFrequencyHints[candidate] ?? 0.5;
  if (freq < 0.8) return null;

  // Target category: pick an unfilled grammatical slot.
  const options: MorphCategory[] = [
    "verb.tense.past",
    "verb.tense.fut",
    "verb.aspect.pfv",
    "verb.aspect.ipfv",
    "noun.case.loc",
    "noun.case.dat",
  ];
  const vacant = options.filter((cat) => !lang.morphology.paradigms[cat]);
  if (vacant.length === 0) return null;
  const target = vacant[rng.int(vacant.length)]!;
  const pdm: Paradigm = {
    affix: form.slice(),
    position: lang.grammar.affixPosition,
    category: target,
  };
  lang.morphology.paradigms[target] = pdm;
  delete lang.lexicon[candidate];
  delete lang.wordFrequencyHints[candidate];
  return {
    kind: "grammaticalization",
    description: `"${candidate}" → ${target} ${pdm.position} /${form.join("")}/`,
  };
}

/**
 * If two paradigms' affixes eroded to the same empty/identical sequence,
 * merge them (category collapse). Returns description or null.
 */
export function maybeMergeParadigms(
  lang: Language,
  rng: Rng,
  probability: number,
): MorphShift | null {
  if (!rng.chance(probability)) return null;
  const cats = Object.keys(lang.morphology.paradigms) as MorphCategory[];
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const a = lang.morphology.paradigms[cats[i]!];
      const b = lang.morphology.paradigms[cats[j]!];
      if (!a || !b) continue;
      if (a.position !== b.position) continue;
      if (a.affix.join("") !== b.affix.join("")) continue;
      // Merge: keep the earlier category, drop the second.
      delete lang.morphology.paradigms[cats[j]!];
      return {
        kind: "category_merge",
        description: `${cats[j]} merged into ${cats[i]}`,
      };
    }
  }
  return null;
}

/**
 * Inflect a bare form according to a paradigm. Useful for the Grammar/Translator UIs.
 */
export function inflect(base: WordForm, paradigm: Paradigm | undefined): WordForm {
  if (!paradigm) return base;
  return paradigm.position === "prefix"
    ? [...paradigm.affix, ...base]
    : [...base, ...paradigm.affix];
}
