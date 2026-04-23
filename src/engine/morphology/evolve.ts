import type { Morphology, MorphCategory, Paradigm } from "./types";
import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { semanticTagOf, pathwayTargets } from "../semantics/grammaticalization";

export interface MorphShift {
  kind: "affix_erode" | "category_merge" | "grammaticalization";
  description: string;
  /**
   * Set when this shift was a grammaticalization — lets callers record
   * the source meaning + pathway tag in the resulting language event.
   */
  source?: { meaning: string; pathway: string; category: MorphCategory };
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
 * Rare: a common lexeme transitions into a grammatical affix. Selection
 * is pathway-driven (Heine & Kuteva) — only meanings with a semantic tag
 * that maps onto a vacant grammatical slot are candidates. So English's
 * "going to" → future is plausible; a random noun → future is not.
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

  // Enumerate all (meaning, targetCategory) pairs allowed by the
  // grammaticalization-pathway table, skipping anything already filled
  // or anything whose source-form is unfit (too long, too rare, empty).
  type Candidate = {
    meaning: string;
    tag: string;
    target: MorphCategory;
    form: WordForm;
  };
  const candidates: Candidate[] = [];
  for (const m of meanings) {
    const tag = semanticTagOf(m);
    if (!tag) continue;
    const form = lang.lexicon[m]!;
    if (form.length === 0 || form.length > 4) continue;
    const freq = lang.wordFrequencyHints[m] ?? 0.5;
    if (freq < 0.6) continue;
    for (const target of pathwayTargets(tag)) {
      if (lang.morphology.paradigms[target]) continue;
      candidates.push({ meaning: m, tag, target, form });
    }
  }
  if (candidates.length === 0) return null;

  const chosen = candidates[rng.int(candidates.length)]!;
  const pdm: Paradigm = {
    affix: chosen.form.slice(),
    position: lang.grammar.affixPosition,
    category: chosen.target,
    source: { meaning: chosen.meaning, pathway: chosen.tag },
  };
  lang.morphology.paradigms[chosen.target] = pdm;
  // Grammaticalization retires the source word — clean every per-meaning
  // map so we don't leave orphan register tags / neighbours / origins
  // behind (the 2000-gen smoke test caught ~1 per run here).
  const candidate = chosen.meaning;
  delete lang.lexicon[candidate];
  delete lang.wordFrequencyHints[candidate];
  delete lang.wordOrigin[candidate];
  delete lang.localNeighbors[candidate];
  delete lang.lastChangeGeneration[candidate];
  if (lang.registerOf) delete lang.registerOf[candidate];
  return {
    kind: "grammaticalization",
    description: `"${candidate}" (${chosen.tag}) → ${chosen.target} ${pdm.position} /${chosen.form.join("")}/`,
    source: {
      meaning: candidate,
      pathway: chosen.tag,
      category: chosen.target,
    },
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
