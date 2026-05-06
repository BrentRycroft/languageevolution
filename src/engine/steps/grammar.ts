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
import { maybeSpawnSynonym, maybeSuppressHomonym, maybeReplacePrimary } from "../lexicon/synonyms";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { activateModule, deactivateModule } from "../modules/registry";
import { wordOrderModuleId, WORD_ORDER_MODULE_IDS } from "../modules/syntactical";

export function stepGrammar(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const p = Math.min(1, config.grammar.driftProbabilityPerGeneration * lang.conservatism * realismMultiplier(config));
  if (!rng.chance(p)) return;
  const simplification = simplificationFactor(lang.speakers);
  // Phase 39l: sister-drift dampening. Daughters within 30 gens of
  // split have their drift rate cut to 0.4× — preserves sister-
  // language similarity for the early post-split window.
  const dampener = lang.siblingDriftDampenUntil !== undefined
    && generation < lang.siblingDriftDampenUntil
    ? 0.4
    : 1;
  const shifts = driftGrammar(lang.grammar, rng, simplification, dampener);
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
    // Phase 46a-migration: swap the active wordOrder module so the
    // realiser tracks the new order. Idempotent; only fires when
    // the language is module-aware.
    if (lang.activeModules instanceof Set) {
      const fromId = wordOrderModuleId(orderShift.from as Language["grammar"]["wordOrder"]);
      const toId = wordOrderModuleId(orderShift.to as Language["grammar"]["wordOrder"]);
      if (fromId !== toId) {
        for (const id of WORD_ORDER_MODULE_IDS) {
          if (id !== toId) deactivateModule(lang, id);
        }
        activateModule(lang, toId, { generation, rng, config });
      }
    }
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
  // Phase 38b: literary brake on grammaticalisation rates. Tier-2+
  // literate languages still grammaticalise but slower (Old → Modern
  // English shows real change despite literacy, just measured).
  const literary = lang.literaryStability ?? 0;
  const litMult = 1 - 0.4 * literary;
  // Phase 38c: grammaticalisation cascade multiplier. When in a
  // cascade window, all rates ×3; outside any cascade, rates ×0.3
  // (slower-than-baseline quiet eras between cascades).
  // Roll cascade onset at low baseline rate (0.4%/gen) — modelling
  // English Middle-period inflection collapse, Latin → Romance morph.
  const cascade = lang.grammaticalisationCascade;
  const inCascade = !!(cascade && generation < cascade.until);
  if (!inCascade && rng.chance(0.004)) {
    const duration = 12 + Math.floor(rng.next() * 8); // 12-20 gens
    lang.grammaticalisationCascade = {
      until: generation + duration,
      multiplier: 3.0,
      trigger: "spontaneous",
    };
    pushEvent(lang, {
      generation,
      kind: "grammar_cascade",
      description: `grammaticalisation cascade begins (×3 for ${duration} gens, spontaneous)`,
    });
  } else if (cascade && generation === cascade.until) {
    pushEvent(lang, {
      generation,
      kind: "grammar_cascade",
      description: `grammaticalisation cascade ends (was ×${cascade.multiplier.toFixed(1)})`,
    });
  }
  const activeCascade = lang.grammaticalisationCascade && generation < lang.grammaticalisationCascade.until;
  const cascadeMult = activeCascade ? lang.grammaticalisationCascade!.multiplier : 0.3;
  const gramMult = litMult * cascadeMult;
  const gShift = maybeGrammaticalize(
    lang,
    rng,
    config.morphology.grammaticalizationProbability * lang.conservatism * gramMult,
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
    const repl = maybeAffixReplacement(lang, rng, 0.002 * lang.conservatism * gramMult);
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
    const bf = maybeBackformation(lang, rng, 0.001 * lang.conservatism * gramMult);
    if (bf) {
      pushEvent(lang, {
        generation,
        kind: "lexical_replacement",
        description: `back-formation: extracted "${bf.newLemma}" from "${bf.from}" (/${bf.base.join("")}/)`,
        meta: { meaning: bf.newLemma, donorId: bf.from },
      });
    }
  }
  // Phase 37 Tranche 37d: synonym genesis. Low-rate stylistic split
  // of a high-frequency content word into two register variants
  // (mirroring English house/abode, big/large). Tier-scaled — higher
  // tiers spawn synonyms more readily because of literacy and prestige
  // pressures.
  {
    const tier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
    // Phase 39b: tripled from 0.003 to 0.009 — real diachrony has
    // more lexical replacement than sound-change erosion. Combined
    // with the 0.4→0.25 GENERATION_RATE_SCALE cut, the synonym/erosion
    // ratio shifts from ~3:97 toward ~60:40 (matching real proportion).
    const synRate = 0.009 * (1 + tier) * lang.conservatism * gramMult;
    const synEvent = maybeSpawnSynonym(lang, rng, synRate);
    if (synEvent) {
      pushEvent(lang, {
        generation,
        kind: "coinage",
        description: `synonym spawned: "${synEvent.meaning}" gains synonym /${synEvent.synonym.join("")}/ (${synEvent.pathway})`,
        meta: { meaning: synEvent.meaning, pathway: synEvent.pathway },
      });
    }
  }
  // Phase 37 Tranche 37d: homonym suppression. When two non-core
  // meanings share a form AND the loser has a synonym, swap the
  // loser to its synonym. Slower than spawn so synonyms accrete
  // before suppression vacates them.
  {
    // Phase 39b: quadrupled from 0.002 to 0.008 — homonym swaps now
    // happen visibly, modelling real synonym-takes-over-from-homonym.
    // Phase 39 calibration pass: trimmed 0.008 → 0.003. Real homonyms
    // persist for centuries (English bank/bank still distinct after
    // 600 yrs). 0.008/gen gave 80% cumulative suppression over 200
    // gens — too aggressive. 0.003 → ~45% over 200 gens matches.
    const supEvent = maybeSuppressHomonym(lang, rng, 0.003 * lang.conservatism * gramMult);
    if (supEvent) {
      pushEvent(lang, {
        generation,
        kind: "lexical_replacement",
        description: `homonym suppressed: "${supEvent.meaning}" /${supEvent.vacatedForm.join("")}/ → /${supEvent.replacementForm.join("")}/`,
        meta: { meaning: supEvent.meaning },
      });
    }
  }
  // Phase 39b: stylistic-preference primary swap. Low-rate (0.4%/gen)
  // promotion of an existing synonym to primary, demoting old form
  // to synonym slot. Models real cross-generational lexical shifts.
  {
    // Phase 39 calibration: 0.004 → 0.002. At 25y/gen, primary swaps
    // happen at most once per word per millennium. 0.004/gen
    // (one swap per ~250 yrs at the language level) was OK; trim
    // slightly so it doesn't dominate over true sound-change drift.
    const repEvent = maybeReplacePrimary(lang, rng, 0.002 * lang.conservatism * gramMult);
    if (repEvent) {
      pushEvent(lang, {
        generation,
        kind: "lexical_replacement",
        description: `primary swap: "${repEvent.meaning}" /${repEvent.oldForm.join("")}/ → /${repEvent.newForm.join("")}/ (synonym promoted)`,
        meta: { meaning: repEvent.meaning },
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
  const conjClassRate = 0.005 * lang.conservatism * gramMult / Math.max(0.7, simplificationFactor(lang.speakers));
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
  const reanalysisRate = 0.004 * lang.conservatism * gramMult;
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
