import type { Morphology, MorphCategory, Paradigm } from "./types";
import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { semanticTagOf, pathwayTargets } from "../semantics/grammaticalization";
import { posOf } from "../lexicon/pos";

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
    // Conjugation/declension class variants must evolve in lockstep
    // with the base affix — otherwise a class-split paradigm freezes
    // its variant arm while the main arm drifts, producing nonsense
    // alternations after a few hundred generations.
    if (pdm.variants) {
      for (const v of pdm.variants) {
        v.affix = mutate(v.affix);
      }
    }
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
  // grammaticalization-pathway table. Clitics (words with
  // `wordOrigin === "clitic:<pathway>"`) are weighted 3× since
  // real grammaticalization proceeds free-word → clitic → affix and
  // the clitic stage is the natural launch pad into the paradigm.
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
    // Triple-weight the clitic stage. We just push the candidate
    // three times so the uniform `rng.int(candidates.length)` pick
    // below selects it with the right prior.
    const isClitic = (lang.wordOrigin?.[m] ?? "").startsWith("clitic:");
    const freq = lang.wordFrequencyHints[m] ?? 0.5;
    if (freq < 0.6) continue;
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
 * Cliticization: the stage between free word and bound affix. A
 * high-frequency word with a pathway-compatible semantic tag gets
 * phonologically compressed (tail segment shaved, frequency dropped
 * toward 0.45) and tagged `wordOrigin = "clitic:<pathway>"`. The
 * word stays in the lexicon — it's still a lexeme, just more bound
 * in use. `maybeGrammaticalize` later picks clitics 3× as often as
 * bare free words when promoting into a paradigm.
 *
 * This models the attested free → clitic → affix cline — English
 * `is not → isn't → *n-t`, Romance definite articles, Germanic
 * auxiliaries all went through an identifiable clitic phase before
 * fully bonding to a host.
 */
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
    // Skip words that are already clitics.
    if ((lang.wordOrigin?.[m] ?? "").startsWith("clitic:")) continue;
    const form = lang.lexicon[m]!;
    if (form.length < 2 || form.length > 5) continue;
    const freq = lang.wordFrequencyHints[m] ?? 0.5;
    if (freq < 0.7) continue;
    candidates.push({ m, tag, form });
  }
  if (candidates.length === 0) return null;
  const chosen = candidates[rng.int(candidates.length)]!;
  // Shave the final segment so the clitic is visibly shorter than
  // its free-word source. Keeping at least 2 phonemes left.
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
 * Phonologically-conditioned paradigm split. Promotes an existing
 * single-affix paradigm into a two-way conjugation/declension class
 * by perturbing the affix slightly for vowel-final stems vs
 * consonant-final stems. Models the historical emergence of
 * Latin's I/II/III/IV conjugations, Russian's first/second class,
 * Spanish ar/er/ir — all start as morpho-phonological alternation
 * before solidifying into memorised classes.
 *
 * Strategy: pick a paradigm without `variants`; pick whichever
 * stem-shape is rarer in the lexicon as the variant condition;
 * synthesise an alternate affix by changing the first vowel of the
 * existing affix to a slightly different one (a→e, e→i, …) — the
 * phonological perturbation that historically produced the class
 * distinction. Returns the paradigm category that got split.
 */
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
  // Pick the rarer stem shape as the variant condition. Stem shapes
  // come from the meanings that get this paradigm — for now we
  // sample across the whole lexicon as an approximation.
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
  // Perturb the affix's first vowel slightly. This mimics the way
  // Romance ar/er/ir all started as the same Latin inflection with
  // a stem-class-conditioned vowel reduction.
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

/**
 * Inflect a bare form according to a paradigm. Useful for the Grammar/Translator UIs.
 */
export function inflect(
  base: WordForm,
  paradigm: Paradigm | undefined,
  lang?: Language,
  meaning?: string,
): WordForm {
  // Suppletion check: a few high-frequency lexemes override the usual
  // stem+affix computation for certain slots (go/went, be/was). The
  // map is small so the lookup is cheap.
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

/**
 * Resolve which paradigm-variant applies to `base` given the
 * paradigm's `variants` table. Falls back to `paradigm.affix` if no
 * conditioned variant matches. Variants gate on stem-final phoneme
 * shape (vowel-final vs consonant-final), the cross-linguistically
 * commonest first stratum of class-ification.
 */
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

/** Local vowel detector that doesn't depend on the full IPA module. */
function isVowelLike(p: string): boolean {
  // Strip length/tone marks then check the first character. Vowels
  // are a, e, i, o, u, ɛ, ɔ, ə, ɨ, ɯ, ø, y, œ, æ plus their
  // diacriticised forms.
  const base = p.replace(/[ːˈˌ˥˧˩]/g, "");
  if (base.length === 0) return false;
  return /^[aeiouɛɔəɨɯøyœæáéíóúàèìòùâêîôûāēīōūãẽĩõũ]/i.test(base);
}

/**
 * High-frequency verbs sometimes develop suppletion: the past/perfective
 * slot fills with an unrelated root (OE *wend-* > *went* as the past of
 * *go*; Latin *fuī* as the perfect of *sum*). Low-rate event — fires
 * only when the lexicon has ≥2 verbs, one of which is high-frequency
 * (≥ 0.6 hint) and doesn't already have a suppletive form for the
 * chosen category. Returns the meaning + category + donor for the
 * caller to log.
 */
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
  // Pick a high-frequency verb. Suppletion is a high-freq-only
  // phenomenon: rare verbs can't sustain an irregular paradigm because
  // speakers don't hear them often enough to memorise the alternation.
  const highFreq = verbMeanings.filter(
    (m) => (lang.wordFrequencyHints[m] ?? 0.4) >= 0.6,
  );
  if (highFreq.length === 0) return null;
  const meaning = highFreq[rng.int(highFreq.length)]!;
  // Pick a category eligible for suppletion. Past / perfective / future
  // are the typologically likely slots; 1sg person too (Romance go: voy
  // / vas / va / vamos — mixed roots).
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
  // Ensure we're not overwriting an existing suppletive entry.
  const existing = lang.suppletion?.[meaning]?.[category];
  if (existing) return null;
  // Donor: another verb, ideally one that shares some semantic neighbourhood.
  // Simplest rule — pick any other verb whose form is ≥ 2 phonemes long.
  const donors = verbMeanings.filter(
    (m) => m !== meaning && (lang.lexicon[m]?.length ?? 0) >= 2,
  );
  if (donors.length === 0) return null;
  const donorMeaning = donors[rng.int(donors.length)]!;
  const donorForm = lang.lexicon[donorMeaning]!;
  // Write into the suppletion map, lazily initialising.
  if (!lang.suppletion) lang.suppletion = {};
  if (!lang.suppletion[meaning]) lang.suppletion[meaning] = {};
  lang.suppletion[meaning]![category] = donorForm.slice();
  return { meaning, category, donorMeaning };
}
