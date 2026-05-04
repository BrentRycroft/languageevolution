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
  /**
   * Phase 29 Tranche 4i: optional etymology surfaced by mechanisms
   * that know their constituents. Used by genesis.ts to populate
   * lang.wordOriginChain so the UI can show "← cat + tree" for
   * compounds, "← speak + -er" for derivations, etc.
   */
  sources?: {
    partMeanings?: string[];
    donorLangId?: string;
    donorMeaning?: string;
    via?: string;
  };
}

export function tryCoin(
  lang: Language,
  tree: LanguageTree,
  rules: GenesisRule[],
  weights: Record<string, number>,
  globalRate: number,
  rng: Rng,
  cachedNeed?: Record<Meaning, number>,
): CoinageOutcome | null {
  if (!rng.chance(Math.min(1, globalRate))) return null;

  const need = cachedNeed ?? lexicalNeed(lang, tree);
  const target = sampleNeededMeaning(need, rng);
  if (!target) {
    return coinViaLegacy(lang, rules, weights, rng);
  }

  const tier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
  const weighted = MECHANISMS.map((m) => {
    let w = m.baseWeight;
    const paradigms = Object.keys(lang.morphology.paradigms).length;
    if (paradigms === 0) {
      if (m.id === "mechanism.compound") w *= 1.4;
      if (m.id === "mechanism.clipping") w *= 1.3;
      if (m.id === "mechanism.derivation") w *= 0.3;
    } else {
      if (m.id === "mechanism.derivation") w *= 1 + paradigms * 0.15;
    }
    const TIER_MECHANISM_BIAS: Record<number, Record<string, number>> = {
      0: { "mechanism.reduplication": 1.3, "mechanism.ideophone": 1.2 },
      1: { "mechanism.compound": 1.4, "mechanism.calque": 1.3 },
      2: { "mechanism.derivation": 1.4 },
      3: { "mechanism.blending": 1.4, "mechanism.clipping": 1.3 },
    };
    const tierBias = TIER_MECHANISM_BIAS[tier]?.[m.id];
    if (typeof tierBias === "number") w *= tierBias;
    if (m.id === "mechanism.calque" && !target.includes("-")) w = 0;
    return { mech: m, weight: w };
  });

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

    const smoothed = smoothForm(result.form, lang, rng);
    return {
      meaning: target,
      form: smoothed,
      mechanism: pick.mech.id,
      originTag: pick.mech.originTag,
      register: pick.mech.register,
      sources: result.sources,
    };
  }

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

const MAX_SMOOTHING_APPLICATIONS = 3;
function smoothForm(form: WordForm, lang: Language, rng: Rng): WordForm {
  const changes = changesForLang(lang);
  let current = form;
  let applied = 0;
  for (const c of changes) {
    if (applied >= MAX_SMOOTHING_APPLICATIONS) break;
    if (c.probabilityFor(current) <= 0) continue;
    const next = c.apply(current, rng);
    if (next !== current) {
      current = next;
      applied++;
    }
  }
  return current;
}

