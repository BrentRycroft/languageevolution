import type { Language, SimulationConfig } from "../types";
import { driftGrammar, maybeDriftWordOrder } from "../grammar/evolve";
import { enforceTypologicalUniversals } from "../grammar/universals";
import { pickNextStressForDrift } from "../grammar/stressTransitions";
import {
  maybeGrammaticalize,
  maybeMergeParadigms,
  maybeCliticize,
  maybeAffixReplacement,
  maybeBackformation,
  maybeMoodEmergence,
  maybeSuppletion,
  maybeSplitParadigm,
  maybeVowelMutationIrregular,
} from "../morphology/evolve";
import { stepTypologyDrift } from "../grammar/typology_drift";
import { maybeAnalogicalLevel } from "../morphology/analogy";
import { simplificationFactor, realismMultiplier } from "../phonology/rate";
import { maybeReanalyse } from "../lexicon/reanalysis";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

export function stepGrammar(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const p = Math.min(1, config.grammar.driftProbabilityPerGeneration * lang.conservatism * realismMultiplier(config));
  if (!rng.chance(p)) return;
  const simplification = simplificationFactor(lang.speakers);
  const shifts = driftGrammar(lang.grammar, rng, simplification);
  for (const s of shifts) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `${s.feature}: ${String(s.from)} → ${String(s.to)}`,
    });
  }
  // Phase 30 Tranche 30c: gated word-order drift — tier + synthetic-
  // index aware, with a 50-gen cooldown. Pre-fix, English-tier-3
  // languages flipped SVO → SOV in 60 gens. Now they flip ~1/10 as
  // often as a tier-0 inflecting language.
  const orderShift = maybeDriftWordOrder(lang, rng, generation);
  if (orderShift) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `${orderShift.feature}: ${String(orderShift.from)} → ${String(orderShift.to)}`,
    });
  }
  // Soft typological-consistency repair: low-probability nudge of features
  // that violate well-attested implicational universals.
  const repairs = enforceTypologicalUniversals(lang, rng);
  for (const r of repairs) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `${String(r.feature)} → ${String(r.to)} (consistency: ${r.reason})`,
    });
  }
  if (rng.chance(0.3)) {
    const current = lang.stressPattern ?? "penult";
    const next = pickNextStressForDrift(current, rng);
    if (next !== current) {
      lang.stressPattern = next;
      pushEvent(lang, {
        generation,
        kind: "grammar_shift",
        description: `stress pattern: ${current} → ${next}`,
      });
    }
  }
}

export function stepMorphology(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const gShift = maybeGrammaticalize(
    lang,
    rng,
    config.morphology.grammaticalizationProbability * lang.conservatism,
  );
  if (gShift) {
    pushEvent(lang, {
      generation,
      kind: gShift.source ? "grammaticalize" : "grammar_shift",
      description: gShift.description,
      meta: gShift.source
        ? {
            meaning: gShift.source.meaning,
            category: gShift.source.category,
            pathway: gShift.source.pathway,
          }
        : undefined,
    });
  }
  const trudgill = simplificationFactor(lang.speakers);
  const substrateBoost =
    (lang.substrateAccelerationRemaining ?? 0) > 0 ? 3 : 1;
  const merge = maybeMergeParadigms(
    lang,
    rng,
    config.morphology.paradigmMergeProbability *
      lang.conservatism *
      trudgill *
      substrateBoost,
  );
  if (merge) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: merge.description,
    });
  }
  const cliticRate =
    (config.morphology.cliticizationProbability ?? 0) * lang.conservatism;
  if (cliticRate > 0) {
    const clit = maybeCliticize(lang, rng, cliticRate);
    if (clit) {
      pushEvent(lang, {
        generation,
        kind: "grammaticalize",
        description: `cliticization: "${clit.meaning}" (${clit.pathway}) /${clit.from}/ → /${clit.to}/`,
        meta: { meaning: clit.meaning, pathway: clit.pathway },
      });
    }
  }
  // Phase 36 Tranche 36l: mood-emergence pathway.
  if ((lang.grammar.moodMarking ?? "declarative") === "declarative") {
    const moodShift = maybeMoodEmergence(lang, rng);
    if (moodShift) {
      pushEvent(lang, {
        generation,
        kind: "grammaticalize",
        description: moodShift.description,
        meta: { meaning: moodShift.source?.meaning, pathway: moodShift.source?.pathway },
      });
    }
  }
  // Phase 36 Tranche 36h: derivational morpheme replacement.
  if (lang.boundMorphemes && lang.boundMorphemes.size >= 2) {
    const repl = maybeAffixReplacement(lang, rng, 0.002 * lang.conservatism);
    if (repl) {
      const origin = lang.boundMorphemeOrigin?.[repl.meaning];
      if (origin) origin.obsolescentGen = generation;
      pushEvent(lang, {
        generation,
        kind: "grammar_shift",
        description: `affix replacement: "${repl.meaning}" obsolescent → "${repl.replacedBy}"`,
        meta: { meaning: repl.meaning },
      });
    }
  }
  // Phase 36 Tranche 36s: back-formation. When a fossilised compound
  // ends in a recognised productive bound morpheme, speakers may
  // re-extract the base as a new lexeme (editor → edit pattern).
  if (lang.compounds && lang.boundMorphemes && lang.boundMorphemes.size > 0) {
    const bf = maybeBackformation(lang, rng, 0.001 * lang.conservatism);
    if (bf) {
      pushEvent(lang, {
        generation,
        kind: "lexical_replacement",
        description: `back-formation: extracted "${bf.newLemma}" from "${bf.from}" (/${bf.base.join("")}/)`,
        meta: { meaning: bf.newLemma, donorId: bf.from },
      });
    }
  }
  const analogyRate =
    (config.morphology.analogyProbability ?? 0) * lang.conservatism;
  if (analogyRate > 0) {
    const ana = maybeAnalogicalLevel(lang, rng, analogyRate);
    if (ana) {
      pushEvent(lang, {
        generation,
        kind: "grammar_shift",
        description: `analogy: "${ana.meaning}" reshaped ${ana.from} → ${ana.to}`,
      });
    }
  }
  const conjClassRate = 0.005 * lang.conservatism / Math.max(0.7, simplificationFactor(lang.speakers));
  if (conjClassRate > 0) {
    const split = maybeSplitParadigm(lang, rng, conjClassRate);
    if (split) {
      pushEvent(lang, {
        generation,
        kind: "grammar_shift",
        description: `paradigm class split: "${split.category}" gains ${split.condition} variant`,
      });
    }
  }
  const reanalysisRate = 0.004 * lang.conservatism;
  if (reanalysisRate > 0) {
    const ev = maybeReanalyse(lang, rng, reanalysisRate);
    if (ev) {
      pushEvent(lang, {
        generation,
        kind: "grammar_shift",
        description: `reanalysis: "${ev.source}" → suffix ${ev.promotedTag} = /${ev.affix.join("")}/`,
      });
    }
  }
  const suppletionRate =
    (config.morphology.suppletionProbability ?? 0) * lang.conservatism;
  if (suppletionRate > 0) {
    const sup = maybeSuppletion(lang, rng, suppletionRate);
    if (sup) {
      pushEvent(lang, {
        generation,
        kind: "suppletion",
        description: `suppletion: "${sup.meaning}" (${sup.category}) adopts root of "${sup.donorMeaning}"`,
        meta: { meaning: sup.meaning, category: sup.category },
      });
    }
    const ablaut = maybeVowelMutationIrregular(lang, rng, suppletionRate * 0.6);
    if (ablaut) {
      pushEvent(lang, {
        generation,
        kind: "suppletion",
        description: `ablaut irregular: "${ablaut.meaning}" (${ablaut.category}) gains a vowel-mutated form`,
        meta: { meaning: ablaut.meaning, category: ablaut.category },
      });
    }
  }
  stepTypologyDrift(lang, generation);
}
