import type { Language, SimulationConfig } from "../types";
import { driftGrammar } from "../grammar/evolve";
import {
  maybeGrammaticalize,
  maybeMergeParadigms,
  maybeCliticize,
  maybeSuppletion,
  maybeSplitParadigm,
} from "../morphology/evolve";
import { maybeAnalogicalLevel } from "../morphology/analogy";
import { simplificationFactor, realismMultiplier } from "../phonology/rate";
import { maybeReanalyse } from "../lexicon/reanalysis";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

/** Stress-pattern drift adjacencies — avoid teleporting initial↔final. */
const STRESS_ADJACENT: Record<
  NonNullable<Language["stressPattern"]>,
  NonNullable<Language["stressPattern"]>[]
> = {
  initial: ["penult"],
  penult: ["initial", "final"],
  final: ["penult"],
};

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
  // Stress pattern drifts independently, at roughly a third of the
  // grammar-drift rate — it's a deeper feature (reshapes the whole
  // rhythm of the language) and real languages only flip every few
  // millennia (proto-Germanic initial → Old English initial → Middle
  // English mixed → Modern English mixed).
  if (rng.chance(0.3)) {
    const current = lang.stressPattern ?? "penult";
    const options = STRESS_ADJACENT[current];
    const next = options[rng.int(options.length)]!;
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
  // Trudgill-effect: large communities shed paradigms faster than small
  // ones. Multiplies into the configured probability so very small
  // languages mostly hold onto their inflections.
  const trudgill = simplificationFactor(lang.speakers);
  // Substrate-acceleration phase (set by contact.ts when the loan
  // rate exceeds the threshold). Triples the merger probability for
  // up to 50 gens — models the case-system collapse we see in
  // languages that absorb mass loans (Old English under Norse).
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
  // Conjugation/declension class emergence. Inverse of the Trudgill
  // factor — small isolated communities elaborate phonologically-
  // conditioned class splits more readily than big lingua francas.
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
  // Morphological reanalysis: occasional compound → productive
  // suffix promotion. Low rate because productive suffixes
  // historically take centuries to stabilise out of fossil
  // compounds. Bigger effect in the long run since it expands the
  // language's derivational repertoire.
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
        kind: "grammar_shift",
        description: `suppletion: "${sup.meaning}" (${sup.category}) adopts root of "${sup.donorMeaning}"`,
        meta: { meaning: sup.meaning, category: sup.category },
      });
    }
  }
}
