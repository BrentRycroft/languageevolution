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
  return paradigm.position === "prefix"
    ? [...paradigm.affix, ...base]
    : [...base, ...paradigm.affix];
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
