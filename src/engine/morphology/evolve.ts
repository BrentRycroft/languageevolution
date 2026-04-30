import type { Morphology, MorphCategory, Paradigm } from "./types";
import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { semanticTagOf, pathwayTargets } from "../semantics/grammaticalization";
import { posOf } from "../lexicon/pos";

export interface MorphShift {
  kind: "affix_erode" | "category_merge" | "grammaticalization";
  description: string;
  source?: { meaning: string; pathway: string; category: MorphCategory };
}

export function applyPhonologyToAffixes(
  morph: Morphology,
  mutate: (form: WordForm) => WordForm,
): void {
  for (const cat of Object.keys(morph.paradigms) as MorphCategory[]) {
    const pdm = morph.paradigms[cat];
    if (!pdm) continue;
    pdm.affix = mutate(pdm.affix);
    if (pdm.variants) {
      for (const v of pdm.variants) {
        v.affix = mutate(v.affix);
      }
    }
  }
}

export function maybeGrammaticalize(
  lang: Language,
  rng: Rng,
  probability: number,
): MorphShift | null {
  if (!rng.chance(probability)) return null;
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length === 0) return null;

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
    const isClitic = (lang.wordOrigin?.[m] ?? "").startsWith("clitic:");
    const freq = lang.wordFrequencyHints[m] ?? 0.5;
    const freqFloor = isClitic ? 0.4 : 0.6;
    if (freq < freqFloor) continue;
    for (const target of pathwayTargets(tag)) {
      if (lang.morphology.paradigms[target]) continue;
      const entry: Candidate = { meaning: m, tag, target, form };
      candidates.push(entry);
      if (isClitic) {
        candidates.push(entry);
        candidates.push(entry);
      }
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

export function maybeCliticize(
  lang: Language,
  rng: Rng,
  probability: number,
): { meaning: string; from: string; to: string; pathway: string } | null {
  if (!rng.chance(probability)) return null;
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length === 0) return null;
  type Cand = { m: string; tag: string; form: WordForm };
  const candidates: Cand[] = [];
  for (const m of meanings) {
    const tag = semanticTagOf(m);
    if (!tag) continue;
    if ((lang.wordOrigin?.[m] ?? "").startsWith("clitic:")) continue;
    const form = lang.lexicon[m]!;
    if (form.length < 2 || form.length > 5) continue;
    const freq = lang.wordFrequencyHints[m] ?? 0.5;
    if (freq < 0.7) continue;
    candidates.push({ m, tag, form });
  }
  if (candidates.length === 0) return null;
  const chosen = candidates[rng.int(candidates.length)]!;
  const next = chosen.form.slice(0, -1);
  if (next.length < 2) return null;
  lang.lexicon[chosen.m] = next;
  lang.wordOrigin[chosen.m] = `clitic:${chosen.tag}`;
  lang.wordFrequencyHints[chosen.m] = 0.45;
  return {
    meaning: chosen.m,
    from: chosen.form.join(""),
    to: next.join(""),
    pathway: chosen.tag,
  };
}

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
      delete lang.morphology.paradigms[cats[j]!];
      return {
        kind: "category_merge",
        description: `${cats[j]} merged into ${cats[i]}`,
      };
    }
  }
  return null;
}

export function maybeSplitParadigm(
  lang: Language,
  rng: Rng,
  probability: number,
): { category: MorphCategory; condition: "vowel-final" | "consonant-final" } | null {
  if (!rng.chance(probability)) return null;
  const cats = (Object.keys(lang.morphology.paradigms) as MorphCategory[])
    .filter((c) => {
      const p = lang.morphology.paradigms[c];
      return p && (!p.variants || p.variants.length === 0);
    });
  if (cats.length === 0) return null;
  const cat = cats[rng.int(cats.length)]!;
  const paradigm = lang.morphology.paradigms[cat]!;
  if (paradigm.affix.length === 0) return null;
  let vowelFinal = 0;
  let consonantFinal = 0;
  for (const form of Object.values(lang.lexicon)) {
    const last = form[form.length - 1];
    if (!last) continue;
    if (isVowelLike(last)) vowelFinal++;
    else consonantFinal++;
  }
  if (vowelFinal === 0 || consonantFinal === 0) return null;
  const condition: "vowel-final" | "consonant-final" =
    vowelFinal < consonantFinal ? "vowel-final" : "consonant-final";
  const variantAffix = perturbAffix(paradigm.affix, rng);
  if (variantAffix.join("") === paradigm.affix.join("")) return null;
  paradigm.variants = [{ when: condition, affix: variantAffix }];
  return { category: cat, condition };
}

const VOWEL_PERTURBATIONS: Record<string, string[]> = {
  a: ["e", "ɛ"],
  e: ["i", "ɛ", "a"],
  i: ["e", "ɛ"],
  o: ["u", "ɔ"],
  u: ["o", "ɔ"],
  ɛ: ["e", "a"],
  ɔ: ["o", "u"],
};

function perturbAffix(affix: WordForm, rng: { int: (n: number) => number }): WordForm {
  for (let i = 0; i < affix.length; i++) {
    const p = affix[i]!;
    const options = VOWEL_PERTURBATIONS[p];
    if (!options) continue;
    const swap = options[rng.int(options.length)]!;
    const out = affix.slice();
    out[i] = swap;
    return out;
  }
  return affix.slice();
}

export function inflect(
  base: WordForm,
  paradigm: Paradigm | undefined,
  lang?: Language,
  meaning?: string,
): WordForm {
  if (paradigm && lang?.suppletion && meaning) {
    const forMeaning = lang.suppletion[meaning];
    const override = forMeaning?.[paradigm.category];
    if (override && override.length > 0) return override.slice();
  }
  if (!paradigm) return base;
  const affix = pickAffixVariant(paradigm, base);
  return paradigm.position === "prefix"
    ? [...affix, ...base]
    : [...base, ...affix];
}

function pickAffixVariant(paradigm: Paradigm, base: WordForm): WordForm {
  const variants = paradigm.variants;
  if (!variants || variants.length === 0) return paradigm.affix;
  const last = base[base.length - 1];
  if (!last) return paradigm.affix;
  const isVowelFinal = isVowelLike(last);
  const want: "vowel-final" | "consonant-final" = isVowelFinal
    ? "vowel-final"
    : "consonant-final";
  const match = variants.find((v) => v.when === want);
  return match ? match.affix : paradigm.affix;
}

function isVowelLike(p: string): boolean {
  const base = p.replace(/[ːˈˌ˥˧˩]/g, "");
  if (base.length === 0) return false;
  return /^[aeiouɛɔəɨɯøyœæáéíóúàèìòùâêîôûāēīōūãẽĩõũ]/i.test(base);
}

export function maybeSuppletion(
  lang: Language,
  rng: Rng,
  probability: number,
): { meaning: string; category: MorphCategory; donorMeaning: string } | null {
  if (!rng.chance(probability)) return null;
  const verbMeanings = Object.keys(lang.lexicon).filter(
    (m) => posOf(m) === "verb",
  );
  if (verbMeanings.length < 2) return null;
  const highFreq = verbMeanings.filter(
    (m) => (lang.wordFrequencyHints[m] ?? 0.4) >= 0.6,
  );
  if (highFreq.length === 0) return null;
  const meaning = highFreq[rng.int(highFreq.length)]!;
  const ELIGIBLE_CATS: MorphCategory[] = [
    "verb.tense.past",
    "verb.aspect.pfv",
    "verb.tense.fut",
    "verb.person.1sg",
    "verb.person.3sg",
  ];
  const availableCats = ELIGIBLE_CATS.filter((c) => lang.morphology.paradigms[c]);
  if (availableCats.length === 0) return null;
  const category = availableCats[rng.int(availableCats.length)]!;
  const existing = lang.suppletion?.[meaning]?.[category];
  if (existing) return null;
  const donors = verbMeanings.filter(
    (m) => m !== meaning && (lang.lexicon[m]?.length ?? 0) >= 2,
  );
  if (donors.length === 0) return null;
  const donorMeaning = donors[rng.int(donors.length)]!;
  const donorForm = lang.lexicon[donorMeaning]!;
  if (!lang.suppletion) lang.suppletion = {};
  if (!lang.suppletion[meaning]) lang.suppletion[meaning] = {};
  lang.suppletion[meaning]![category] = donorForm.slice();
  return { meaning, category, donorMeaning };
}
