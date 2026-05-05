import type { Morphology, MorphCategory, Paradigm } from "./types";
import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { semanticTagOf, pathwayTargets } from "../semantics/grammaticalization";
import { posOf, isClosedClass } from "../lexicon/pos";
import { setLexiconForm, deleteMeaning } from "../lexicon/mutate";
import { harmonizeAffix } from "./harmony";
import { genderOf } from "./gender";

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
  // Phase 33 Tranche 33i: probabilistic article-emergence pathway —
  // before the standard maybeGrammaticalize fires, give the language
  // a chance to develop articles from demonstratives (Latin ille
  // → Romance le/la/il; OE se/seo → English the). PIE descendants
  // historically did this within the first ~1000-1500 years; in
  // simulator gens that's 30-60 gens. Pre-Phase-33-i `articlePresence`
  // never changed once seeded, so PIE / Bantu / Tokipona descendants
  // could never develop articles even when grammar-drifted.
  if (lang.grammar.articlePresence === "none") {
    const demShift = maybeArticleEmergence(lang, rng);
    if (demShift) return demShift;
  }

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
    // Phase 26c: grammaticalisation operates on OPEN-class meanings →
    // closed-class function. Skip already-closed-class meanings (the
    // promotion already happened, or they were always functional).
    if (isClosedClass(posOf(m))) continue;
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
  // Phase 29 Tranche 1a: route through the lexicon mutation chokepoint
  // so lang.words stays in sync (grammaticalisation removes the source
  // meaning entirely; pre-1a the manual teardown left a stale word).
  deleteMeaning(lang, candidate);
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
 * Phase 33 Tranche 33i: article emergence via demonstrative
 * grammaticalization. When a language has `articlePresence: "none"`
 * and a demonstrative in its lexicon, with low per-gen probability
 * (~0.5% × tier+1) the demonstrative grammaticalises into a free
 * or proclitic article. Mirrors Latin ille→Romance le/la, OE
 * se→Modern English the, Greek ho→none-then-redeveloped, etc.
 *
 * Returns null if the trigger doesn't fire. Mutates lang.grammar.
 * Rolls 60% free / 30% proclitic / 10% enclitic when it fires.
 */
function maybeArticleEmergence(
  lang: Language,
  rng: Rng,
): MorphShift | null {
  if (lang.grammar.articlePresence !== "none") return null;
  // Need a demonstrative source — "that" is the cross-linguistically
  // dominant donor for definite articles; "this" is rarer; "the" if
  // already present (closed-class seeded) means we already half-have
  // it and just need to flip articlePresence.
  const donor = lang.lexicon["that"]
    ? "that"
    : lang.lexicon["this"]
      ? "this"
      : lang.lexicon["the"]
        ? "the"
        : null;
  if (!donor) return null;
  const tier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
  // Tier 0 → 0.4%/gen; tier 3 → 1.6%/gen. Higher culture = more
  // explicit definiteness marking (statehood, literacy, scribal
  // standardisation push articles into the system).
  const baseRate = 0.004 * (1 + tier);
  if (!rng.chance(baseRate)) return null;
  const r = rng.next();
  const next: NonNullable<Language["grammar"]["articlePresence"]> =
    r < 0.6 ? "free" : r < 0.9 ? "proclitic" : "enclitic";
  // Promote: copy donor form to "the" if it isn't already there,
  // and reduce its frequency hint slightly (function words erode).
  if (!lang.lexicon["the"]) {
    lang.lexicon["the"] = lang.lexicon[donor]!.slice();
    lang.wordFrequencyHints["the"] = 0.97;
    lang.wordOrigin["the"] = `grammaticalization:${donor}`;
  }
  lang.grammar.articlePresence = next;
  return {
    kind: "grammaticalization",
    description: `articles emerge: "${donor}" (demonstrative) → definite article (${next}); articlePresence: none → ${next}`,
    source: { meaning: donor, pathway: "demonstrative", category: "noun.case.nom" },
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
  // Phase 29 Tranche 1a: route through chokepoint so words stays in sync.
  setLexiconForm(lang, chosen.m, next, { bornGeneration: 0, origin: `clitic:${chosen.tag}` });
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
  let affix = pickAffixVariant(paradigm, base, lang, meaning);
  if (lang?.grammar.harmony && lang.grammar.harmony !== "none") {
    affix = harmonizeAffix(affix, base, lang.grammar.harmony);
  }
  return paradigm.position === "prefix"
    ? [...affix, ...base]
    : [...base, ...affix];
}

export interface CascadeResult {
  form: WordForm;
  applied: MorphCategory[];
}

export function inflectCascade(
  base: WordForm,
  categories: readonly MorphCategory[],
  lang: Language,
  meaning: string,
): CascadeResult {
  const available = categories.filter((c) => !!lang.morphology.paradigms[c]);
  const synth = lang.grammar.synthesisIndex ?? 2.0;
  const cap = Math.max(1, Math.round(synth));
  const slice = available.slice(0, cap);

  let form = base;
  const fusion = lang.grammar.fusionIndex ?? 0.5;
  const applied: MorphCategory[] = [];

  for (const cat of slice) {
    const p = lang.morphology.paradigms[cat]!;
    const before = form;
    form = inflect(before, p, lang, meaning);
    applied.push(cat);

    if (fusion >= 0.7 && p.position === "suffix") {
      while (
        form.length >= 2 &&
        form[form.length - p.affix.length - 1] === p.affix[0]
      ) {
        form.splice(form.length - p.affix.length, 0);
        break;
      }
      const seam = before.length;
      if (seam > 0 && seam < form.length && form[seam - 1] === form[seam]) {
        form.splice(seam, 1);
      }
    }
  }

  return { form, applied };
}

function pickAffixVariant(
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

const VOWEL_MUTATIONS: Record<string, string> = {
  a: "i", o: "i", u: "i",
  e: "a",
  i: "ɪ",
};

function vowelMutationOf(form: import("../types").WordForm): import("../types").WordForm | null {
  for (let i = form.length - 1; i >= 0; i--) {
    const p = form[i]!;
    const swap = VOWEL_MUTATIONS[p];
    if (swap) {
      const out = form.slice();
      out[i] = swap;
      return out;
    }
  }
  return null;
}

export function maybeVowelMutationIrregular(
  lang: Language,
  rng: Rng,
  probability: number,
): { meaning: string; category: MorphCategory } | null {
  if (!rng.chance(probability)) return null;
  const candidates = Object.keys(lang.lexicon).filter((m) => {
    const pos = posOf(m);
    return pos === "noun" || pos === "adjective";
  });
  if (candidates.length === 0) return null;
  const highFreq = candidates.filter(
    (m) => (lang.wordFrequencyHints[m] ?? 0.4) >= 0.55,
  );
  if (highFreq.length === 0) return null;
  const meaning = highFreq[rng.int(highFreq.length)]!;
  const isNoun = posOf(meaning) === "noun";
  const category: MorphCategory = isNoun
    ? "noun.num.pl"
    : rng.chance(0.5)
      ? "adj.degree.cmp"
      : "adj.degree.sup";
  if (!lang.morphology.paradigms[category]) return null;
  const existing = lang.suppletion?.[meaning]?.[category];
  if (existing) return null;
  const baseForm = lang.lexicon[meaning];
  if (!baseForm || baseForm.length < 2) return null;
  const mutated = vowelMutationOf(baseForm);
  if (!mutated) return null;
  if (!lang.suppletion) lang.suppletion = {};
  if (!lang.suppletion[meaning]) lang.suppletion[meaning] = {};
  lang.suppletion[meaning]![category] = mutated;
  return { meaning, category };
}
