import type { Language, LanguageTree, Meaning, WordForm } from "../types";
import type { GenesisRule } from "./types";
import type { Rng } from "../rng";
import { weightedSample } from "../utils/sampling";
import { MECHANISMS } from "./mechanisms";
import { lexicalNeed, sampleNeededMeaning } from "./need";
import { changesForLang } from "../steps/helpers";

export interface CoinageOutcome {
  meaning: Meaning;
  form: WordForm;
  mechanism: string;
  originTag: string;
  register?: "high" | "low";
}

/**
 * Coin a new word for a target meaning sampled from the language's
 * lexical-need vector. Tries mechanisms in weighted order until one
 * accepts. Falls back to legacy catalog rules if no mechanism feeds.
 *
 * Returns the outcome so the caller can record origin + register tags.
 */
export function tryCoin(
  lang: Language,
  tree: LanguageTree,
  rules: GenesisRule[],
  weights: Record<string, number>,
  globalRate: number,
  rng: Rng,
): CoinageOutcome | null {
  if (!rng.chance(Math.min(1, globalRate))) return null;

  // 1. Sample a target meaning from lexical-need pressure.
  const need = lexicalNeed(lang, tree);
  const target = sampleNeededMeaning(need, rng);
  if (!target) {
    // No needed meaning. Fall back to legacy catalog for variety (lets
    // reduplication/intens forms keep firing on dense lexicons).
    return coinViaLegacy(lang, rules, weights, rng);
  }

  // 2. Pick a mechanism weighted by language style + mechanism bias.
  const weighted = MECHANISMS.map((m) => {
    let w = m.baseWeight;
    // Isolating grammar: boost compound + clipping.
    const paradigms = Object.keys(lang.morphology.paradigms).length;
    if (paradigms === 0) {
      if (m.id === "mechanism.compound") w *= 1.4;
      if (m.id === "mechanism.clipping") w *= 1.3;
      if (m.id === "mechanism.derivation") w *= 0.3;
    } else {
      if (m.id === "mechanism.derivation") w *= 1 + paradigms * 0.15;
    }
    // Calque only viable when the meaning is compound-shaped.
    if (m.id === "mechanism.calque" && !target.includes("-")) w = 0;
    return { mech: m, weight: w };
  });

  // Pick mechanisms in weighted random order and try each until one fires.
  const attempted = new Set<string>();
  for (let attempt = 0; attempt < MECHANISMS.length; attempt++) {
    const pick = weightedSample(
      weighted.filter((w) => !attempted.has(w.mech.id)),
      (w) => w.weight,
      rng,
    );
    if (!pick) break;
    attempted.add(pick.mech.id);
    const result = pick.mech.tryCoin(lang, target, tree, rng);
    if (!result) continue;

    // 3. Phonotactic smoothing: pass once through the language's active
    //    procedural rules so the coinage fits the language's sound.
    const smoothed = smoothForm(result.form, lang, rng);
    return {
      meaning: target,
      form: smoothed,
      mechanism: pick.mech.id,
      originTag: pick.mech.originTag,
      register: pick.mech.register,
    };
  }

  // 4. Fallback: legacy catalog — generates compound/intens forms even
  //    when the need vector is empty-ish.
  return coinViaLegacy(lang, rules, weights, rng);
}

function coinViaLegacy(
  lang: Language,
  rules: GenesisRule[],
  weights: Record<string, number>,
  rng: Rng,
): CoinageOutcome | null {
  if (rules.length === 0) return null;
  const chosen = weightedSample(rules, (r) => weights[r.id] ?? r.baseWeight, rng);
  if (!chosen) return null;
  const result = chosen.tryCoin(lang, rng);
  if (!result) return null;
  return {
    meaning: result.meaning,
    form: result.form,
    mechanism: chosen.id,
    originTag: chosen.category,
  };
}

/**
 * Apply one pass of the language's active sound changes to the form.
 * Deterministic under rng; doesn't modify the lexicon.
 */
function smoothForm(form: WordForm, lang: Language, rng: Rng): WordForm {
  const changes = changesForLang(lang);
  let current = form;
  for (const c of changes) {
    if (c.probabilityFor(current) <= 0) continue;
    const next = c.apply(current, rng);
    if (next !== current) {
      current = next;
      break; // one pass only
    }
  }
  return current;
}

/**
 * Legacy entry point retained for genesis.ts's step function. Returns
 * just the meaning to preserve the old signature; callers should switch
 * to `tryCoin` for rich outcome info.
 */
export function tryGenesis(
  lang: Language,
  rules: GenesisRule[],
  weights: Record<string, number>,
  globalRate: number,
  rng: Rng,
): Meaning | null {
  const out = tryCoinBackCompat(lang, rules, weights, globalRate, rng);
  return out ? out.meaning : null;
}

/**
 * Back-compat shim for callers that don't pass the language tree in.
 * Runs the full mechanism pipeline with an empty tree — that disables
 * calque but keeps everything else working.
 */
function tryCoinBackCompat(
  lang: Language,
  rules: GenesisRule[],
  weights: Record<string, number>,
  globalRate: number,
  rng: Rng,
): CoinageOutcome | null {
  const tree: LanguageTree = { [lang.id]: { language: lang, parentId: null, childrenIds: [] } };
  const result = tryCoin(lang, tree, rules, weights, globalRate, rng);
  if (result) lang.lexicon[result.meaning] = result.form;
  return result;
}
