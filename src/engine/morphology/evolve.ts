import type { Morphology, MorphCategory, Paradigm } from "./types";
import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { semanticTagOf, pathwayTargetsForLang } from "../semantics/grammaticalization";
import { posOf, isClosedClass } from "../lexicon/pos";
import { setLexiconForm, deleteMeaning } from "../lexicon/mutate";
import { applyParadigm, isVowelLike } from "./apply";
import { isSyllabic } from "../phonology/ipa";
import { lexGet, lexSet, lexHas, lexKeys, lexValues } from "../lexicon/access";

/**
 * evolve.ts
 *
 * Morphological paradigms, suppletion, gender, analogical levelling, ablaut, runtime productive derivation. Key exports: MorphShift, applyPhonologyToAffixes, maybeGrammaticalize.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

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
    // Phase 64 T2: ablaut maps must also track sound change. When /i/
    // merges into /e/, an ablautMap `{i: "a"}` can no longer fire
    // because no stem contains /i/ anymore — the key needs to follow
    // the merger so sing/sang shifts to seng/sang in the new
    // phonology. Both keys AND values are mutated; entries that
    // collide (different keys mapping to same source vowel) are
    // collapsed.
    if (pdm.ablautMap) {
      const next: Record<string, string> = {};
      for (const [src, dst] of Object.entries(pdm.ablautMap)) {
        const newSrc = mutate([src])[0] ?? src;
        const newDst = mutate([dst])[0] ?? dst;
        if (newSrc === newDst) continue; // identity → drop entry
        // First write wins on collision (keep older mapping).
        if (!(newSrc in next)) next[newSrc] = newDst;
      }
      pdm.ablautMap = next;
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
  const meanings = lexKeys(lang);
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
    const form = lexGet(lang, m)!;
    if (form.length === 0 || form.length > 4) continue;
    const isClitic = (lang.wordOrigin?.[m] ?? "").startsWith("clitic:");
    const freq = lang.wordFrequencyHints[m] ?? 0.5;
    const freqFloor = isClitic ? 0.4 : 0.6;
    if (freq < freqFloor) continue;
    // Phase 73c Tier C Phase 1: filter pathway targets through the
    // language's declared `grammaticalisedAxes` (when set). A
    // language with `aspect: ["pfv","ipfv"]` will no longer seed
    // `verb.aspect.prog` etc. via the pathway map. Unset → no
    // filtering (legacy behaviour).
    for (const target of pathwayTargetsForLang(tag, lang)) {
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

  // Phase 66 T1: stage tracking. Pre-Phase-66 the meaning was
  // deleted from the lexicon the moment its first grammaticalisation
  // fired (line 115 `deleteMeaning(lang, candidate)`). That made
  // chained pathways (Latin habere → aux → synthetic perfect →
  // zero) impossible — the source vanished after step 1. Now we
  // mark the meaning at stage 2 (bound affix, paradigm registered)
  // but keep it in the lexicon at reduced frequency so subsequent
  // calls to `progressGrammaticalizationChain` can advance it
  // through stages 3 (fusion) and 4 (loss).
  if (!lang.grammaticalizationStage) lang.grammaticalizationStage = {};
  lang.grammaticalizationStage[candidate] = {
    stage: 2,
    targetCategory: chosen.target,
    lastTransitionGen: 0, // caller patches via progressGrammaticalizationChain
  };
  // Reduce the surface form's frequency so its lexical use fades
  // gradually (real grammaticalised verbs see steep frequency drop).
  if (lang.wordFrequencyHints[candidate] !== undefined) {
    lang.wordFrequencyHints[candidate] = Math.max(
      0.1,
      lang.wordFrequencyHints[candidate]! * 0.5,
    );
  }
  return {
    kind: "grammaticalization",
    description: `"${candidate}" (${chosen.tag}) → ${chosen.target} ${pdm.position} /${chosen.form.join("")}/ [stage 2]`,
    source: {
      meaning: candidate,
      pathway: chosen.tag,
      category: chosen.target,
    },
  };
}

/**
 * Phase 66 T1: advance a meaning's grammaticalisation stage. Called
 * once per gen per language; with low probability picks a stage-2
 * meaning and advances it to stage 3 (fusion: form is reduced
 * further, paradigm boundary blurs), or a stage-3 meaning to stage 4
 * (the lexical entry is deleted). Models the canonical word→clitic→
 * affix→fusion→loss chain across multiple gens.
 */
export function progressGrammaticalizationChain(
  lang: Language,
  rng: Rng,
  generation: number,
): MorphShift | null {
  if (!lang.grammaticalizationStage) return null;
  if (!rng.chance(0.04)) return null; // ~4% per gen ≈ 1 transition every 25 gens
  const candidates: string[] = [];
  for (const [m, st] of Object.entries(lang.grammaticalizationStage)) {
    if (!st) continue;
    if (st.stage < 2 || st.stage >= 4) continue;
    if (generation - st.lastTransitionGen < 5) continue; // cooldown
    candidates.push(m);
  }
  if (candidates.length === 0) return null;
  const chosen = candidates[rng.int(candidates.length)]!;
  const st = lang.grammaticalizationStage[chosen]!;
  const newStage = (st.stage + 1) as 3 | 4;
  st.stage = newStage;
  st.lastTransitionGen = generation;

  if (newStage === 3) {
    // Fusion: the form's surface drops a phoneme (final-segment
    // erosion). Lexicon form shrinks; the paradigm version is
    // already affixed and stays.
    const form = lexGet(lang, chosen);
    if (form && form.length > 1) {
      lexSet(lang, chosen, form.slice(0, -1));
    }
    return {
      kind: "grammaticalization",
      description: `"${chosen}" → fused [stage 3] (form shortened to /${(lexGet(lang, chosen) ?? []).join("")}/)`,
      source: {
        meaning: chosen,
        pathway: "chain-fusion",
        category: st.targetCategory ?? "verb.tense.past",
      },
    };
  }
  // newStage === 4: total loss. Remove from lexicon entirely.
  // Phase 72d-2 (defer-1a): record grammaticalization-loss pathway.
  // No mergedInto — the lemma is fully consumed by the paradigm.
  deleteMeaning(lang, chosen, { generation, reason: "grammaticalization-stage-4" });
  return {
    kind: "grammaticalization",
    description: `"${chosen}" → lost [stage 4] (lexical entry removed; paradigm continues)`,
    source: {
      meaning: chosen,
      pathway: "chain-loss",
      category: st.targetCategory ?? "verb.tense.past",
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
  const donor = lexHas(lang, "that")
    ? "that"
    : lexHas(lang, "this")
      ? "this"
      : lexHas(lang, "the")
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
  if (!lexHas(lang, "the")) {
    lexSet(lang, "the", lexGet(lang, donor)!.slice());
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

/**
 * Phase 36 Tranche 36h: derivational suffix replacement / obsolescence.
 *
 * With low probability per generation, an established bound morpheme
 * (e.g., `-er.agt`, `-ness`) can be marked obsolescent — new
 * productive coinages stop using it and prefer either a fresh donor
 * from the lexicon or a competitor already in the bound-morpheme
 * pool.
 *
 * Real-world models: Latin `-tor` displaced Germanic `-er` in
 * scholastic Romance registers; Old English `-end` (agentive) was
 * replaced by Middle English `-er`.
 */
export function maybeAffixReplacement(
  lang: Language,
  rng: Rng,
  probability: number = 0.002,
): { meaning: string; replacedBy?: string } | null {
  if (!rng.chance(probability)) return null;
  if (!lang.boundMorphemes || lang.boundMorphemes.size < 2) return null;
  const candidates: string[] = [];
  for (const m of lang.boundMorphemes) {
    const origin = lang.boundMorphemeOrigin?.[m];
    if (origin?.obsolescentGen !== undefined) continue;
    const f = lexGet(lang, m);
    if (!f || f.length === 0) continue;
    candidates.push(m);
  }
  if (candidates.length < 2) return null;
  const target = candidates[rng.int(candidates.length)]!;
  const others = candidates.filter((m) => m !== target);
  const replacement = others[rng.int(others.length)]!;
  if (!lang.boundMorphemeOrigin) lang.boundMorphemeOrigin = {};
  const prior = lang.boundMorphemeOrigin[target] ?? {
    introducedGen: 0,
    pathway: "preset-seed",
  };
  lang.boundMorphemeOrigin[target] = {
    ...prior,
    obsolescentGen: 0, // caller can set if it knows current gen
    replacedBy: replacement,
  };
  return { meaning: target, replacedBy: replacement };
}

/**
 * Phase 36 Tranche 36l: mood-emergence pathway. When a language is
 * `moodMarking: "declarative"` and has a subordinator-clitic donor
 * (`if`, `that`, `because`) of high frequency, with low per-gen
 * probability the donor grammaticalises into a mood-marking prefix
 * on the verb. Flips `moodMarking → "subjunctive"` and seeds a
 * `verb.mood.subj` paradigm from the donor form.
 *
 * Mirrors `maybeArticleEmergence` shape; tier-scaled rate.
 */
export function maybeMoodEmergence(
  lang: Language,
  rng: Rng,
): MorphShift | null {
  if ((lang.grammar.moodMarking ?? "declarative") !== "declarative") return null;
  const donor = lexHas(lang, "if")
    ? "if"
    : lexHas(lang, "that")
      ? "that"
      : lexHas(lang, "because")
        ? "because"
        : null;
  if (!donor) return null;
  const tier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
  // Slower than article emergence (subjunctive is rarer to evolve
  // de novo): tier 0 → 0.1%, tier 3 → 0.4%.
  const baseRate = 0.001 * (1 + tier);
  if (!rng.chance(baseRate)) return null;
  const donorForm = lexGet(lang, donor)!;
  const affix = donorForm.slice(0, Math.min(2, donorForm.length));
  if (affix.length === 0) return null;
  if (lang.morphology.paradigms["verb.mood.subj"]) return null;
  lang.morphology.paradigms["verb.mood.subj"] = {
    affix: affix.slice(),
    position: "prefix",
    category: "verb.mood.subj",
    source: { meaning: donor, pathway: "subordinator" },
  };
  lang.grammar.moodMarking = "subjunctive";
  return {
    kind: "grammaticalization",
    description: `mood emerges: "${donor}" (subordinator) → subjunctive prefix /${affix.join("")}/; moodMarking: declarative → subjunctive`,
    source: { meaning: donor, pathway: "subordinator", category: "verb.mood.subj" },
  };
}

/**
 * Phase 36 Tranche 36s: back-formation / de-derivation.
 *
 * When a fossilised compound's surface ends in a recognised
 * productive suffix, speakers may reanalyse it as base + suffix and
 * extract the base as a new lexicon entry. Models real cycles like
 * editor → edit, televise ← television, enthusiasm → enthuse.
 *
 * Returns the new lemma + base form on success, or null when no
 * candidate fires.
 */
export function maybeBackformation(
  lang: Language,
  rng: Rng,
  probability: number = 0.001,
): { newLemma: string; base: WordForm; from: string } | null {
  if (!rng.chance(probability)) return null;
  if (!lang.compounds || !lang.boundMorphemes) return null;
  const candidates: Array<{
    meaning: string;
    surface: WordForm;
    base: WordForm;
    suffix: string;
  }> = [];
  for (const meaning of Object.keys(lang.compounds)) {
    const meta = lang.compounds[meaning]!;
    if (!meta.fossilized) continue;
    const surface = lexGet(lang, meaning);
    if (!surface) continue;
    for (const morph of lang.boundMorphemes) {
      const affixForm = lexGet(lang, morph);
      if (!affixForm || affixForm.length === 0) continue;
      if (surface.length <= affixForm.length) continue;
      const tail = surface.slice(surface.length - affixForm.length);
      if (tail.join("") !== affixForm.join("")) continue;
      const base = surface.slice(0, surface.length - affixForm.length);
      if (base.length < 2) continue;
      // Skip if base is already a known lexeme.
      const baseStr = base.join("");
      const newLemma = `bf:${baseStr}`;
      if (lexHas(lang, newLemma)) continue;
      candidates.push({ meaning, surface, base, suffix: morph });
    }
  }
  if (candidates.length === 0) return null;
  const chosen = candidates[rng.int(candidates.length)]!;
  const newLemma = `bf:${chosen.base.join("")}`;
  setLexiconForm(lang, newLemma, chosen.base, {
    bornGeneration: 0,
    origin: `backformation:${chosen.meaning}`,
  });
  if (!lang.wordOrigin) lang.wordOrigin = {};
  lang.wordOrigin[newLemma] = `backformation:${chosen.meaning}`;
  return { newLemma, base: chosen.base, from: chosen.meaning };
}

export function maybeCliticize(
  lang: Language,
  rng: Rng,
  probability: number,
): { meaning: string; from: string; to: string; pathway: string } | null {
  if (!rng.chance(probability)) return null;
  const meanings = lexKeys(lang);
  if (meanings.length === 0) return null;
  type Cand = { m: string; tag: string; form: WordForm };
  const candidates: Cand[] = [];
  for (const m of meanings) {
    const tag = semanticTagOf(m);
    if (!tag) continue;
    if ((lang.wordOrigin?.[m] ?? "").startsWith("clitic:")) continue;
    const form = lexGet(lang, m)!;
    if (form.length < 2 || form.length > 5) continue;
    const freq = lang.wordFrequencyHints[m] ?? 0.5;
    if (freq < 0.7) continue;
    candidates.push({ m, tag, form });
  }
  if (candidates.length === 0) return null;
  const chosen = candidates[rng.int(candidates.length)]!;
  const next = chosen.form.slice(0, -1);
  if (next.length < 2) return null;
  // Cliticization erodes the final phoneme, but it must not delete the
  // word's only syllable nucleus — that yields an unpronounceable cluster
  // (e.g. PIE "run" /dər/-like → "dd"). Decline if the eroded form has no
  // syllabic peak (vowel or syllabic resonant), same as the length guard.
  if (!next.some((p) => isSyllabic(p))) return null;
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
  for (const form of lexValues(lang)) {
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

/**
 * Phase 72c T1 (Contract C4 fix): a paradigm whose primary affix and
 * every variant affix is an empty array (length 0) is functionally a
 * no-op. Phonology can erode affixes down to [] (e.g., Latin -m → ∅
 * in coda position); pre-72c the cascade still applied empty paradigms
 * and produced identical surface forms across all cases, hiding the
 * inflectional collapse. We bail to bare stem when this happens; the
 * grammar/morphology drift step (separate concern) is responsible for
 * detecting and removing the collapsed paradigm or for renewing
 * morphology via grammaticalisation.
 */
function paradigmHasOnlyEmptyAffixes(paradigm: Paradigm): boolean {
  if (paradigm.affix && paradigm.affix.length > 0) return false;
  if (!paradigm.variants || paradigm.variants.length === 0) {
    // No variants and primary affix is empty.
    return true;
  }
  for (const v of paradigm.variants) {
    if (v.affix && v.affix.length > 0) return false;
  }
  return true;
}

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
  // Phase 71b T1 (G7): when the language reports no case system
  // (grammar.hasCase=false), suppress noun-case paradigm application
  // entirely. Pre-71b, Tuscan with hasCase=false still emitted
  // accusative -um suffixes via this paradigm, contradicting its
  // declared typology. The suppletion override above still fires —
  // intentional, since suppletion is a different mechanism.
  if (
    lang &&
    !lang.grammar.hasCase &&
    paradigm.category.startsWith("noun.case.")
  ) {
    return base;
  }
  // Phase 72c T1 (Contract C4 fix): empty-affix paradigm guard.
  // Phonology can erode paradigm.affix and its variants down to []
  // (e.g., Latin -m → ∅ in coda position). Pre-72c, inflect() still
  // ran applyParadigm with an empty affix, producing identical
  // surface for all cases — silent paradigm collapse. Now we check
  // the affix (and all variants) for non-emptiness and bail back to
  // the bare stem if every variant has length 0.
  if (paradigmHasOnlyEmptyAffixes(paradigm)) {
    return base;
  }
  // Phase 46a-migration: paradigm dispatch gated on the paradigms
  // module. Module-aware isolating languages (no paradigms in their
  // module set) skip affix application — the analytic-language perf
  // win. Legacy fallback: paradigms always applied (back-compat).
  if (lang && lang.activeModules instanceof Set && !lang.activeModules.has("morphological:paradigms")) {
    return base;
  }
  // Phase 52 T1: paradigm application is now in apply.ts so future
  // non-concatenative paradigm kinds (infix/template/reduplicate/etc.)
  // get applied uniformly across every caller.
  return applyParadigm(base, paradigm, lang, meaning);
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

  // Phase 63: verb theme stripping. When the language declares
  // `grammar.verbThemes` (citation-form markers like Romance -aɾe /
  // -eɾe / -iɾe < Latin -āre / -ēre / -īre) and we're applying at
  // least one verb category, drop the longest matching theme suffix
  // from the base BEFORE appending paradigms. Without this step, a
  // Romance-style verb like /komedeɾe/ "eat" would receive tense
  // suffixes on top of the infinitive (/komedeɾe + aβi/ → 6 syllables);
  // with stripping it inflects from the bare stem (/komed + aβi/ →
  // 4 syllables) the way real Romance does (Spanish "comió" not
  // "comerió"). Suppletion overrides still apply via the inflect
  // call below — they never see the stripped stem.
  let form = base;
  const themes = lang.grammar.verbThemes;
  if (
    themes &&
    themes.length > 0 &&
    slice.some((c) => c.startsWith("verb."))
  ) {
    let bestThemeLen = 0;
    for (const theme of themes) {
      if (theme.length === 0 || theme.length > form.length) continue;
      if (theme.length <= bestThemeLen) continue;
      let match = true;
      for (let i = 0; i < theme.length; i++) {
        if (form[form.length - theme.length + i] !== theme[i]) {
          match = false;
          break;
        }
      }
      if (match) bestThemeLen = theme.length;
    }
    // Always leave at least 1 phoneme of stem so we don't reduce a
    // verb to its bare theme.
    if (bestThemeLen > 0 && form.length - bestThemeLen >= 1) {
      form = form.slice(0, form.length - bestThemeLen);
    }
  }

  const fusion = lang.grammar.fusionIndex ?? 0.5;
  const applied: MorphCategory[] = [];

  for (const cat of slice) {
    const p = lang.morphology.paradigms[cat]!;
    const before = form;
    form = inflect(before, p, lang, meaning);
    applied.push(cat);

    if (fusion >= 0.7 && p.position === "suffix") {
      // Fusion haplology: collapse a doubled phoneme at the morpheme
      // seam (e.g. stem-final /t/ + suffix-initial /t/ → single /t/).
      // `seam` is the boundary; inflect() returns a fresh array so
      // before.length is still the pre-suffix length.
      const seam = before.length;
      if (seam > 0 && seam < form.length && form[seam - 1] === form[seam]) {
        form.splice(seam, 1);
      }
    }
  }

  return { form, applied };
}

export function maybeSuppletion(
  lang: Language,
  rng: Rng,
  probability: number,
): { meaning: string; category: MorphCategory; donorMeaning: string } | null {
  if (!rng.chance(probability)) return null;
  const verbMeanings = lexKeys(lang).filter(
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
    (m) => m !== meaning && (lexGet(lang, m)?.length ?? 0) >= 2,
  );
  if (donors.length === 0) return null;
  const donorMeaning = donors[rng.int(donors.length)]!;
  const donorForm = lexGet(lang, donorMeaning)!;
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
  const candidates = lexKeys(lang).filter((m) => {
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
  const baseForm = lexGet(lang, meaning);
  if (!baseForm || baseForm.length < 2) return null;
  const mutated = vowelMutationOf(baseForm);
  if (!mutated) return null;
  if (!lang.suppletion) lang.suppletion = {};
  if (!lang.suppletion[meaning]) lang.suppletion[meaning] = {};
  lang.suppletion[meaning]![category] = mutated;
  return { meaning, category };
}
