import type { Language, SimulationConfig } from "../types";
import { driftGrammar } from "../grammar/evolve";
import { maybeGrammaticalize, maybeMergeParadigms } from "../morphology/evolve";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

export function stepGrammar(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const p = Math.min(1, config.grammar.driftProbabilityPerGeneration * lang.conservatism);
  if (!rng.chance(p)) return;
  const shifts = driftGrammar(lang.grammar, rng);
  for (const s of shifts) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: `${s.feature}: ${String(s.from)} → ${String(s.to)}`,
    });
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
  const merge = maybeMergeParadigms(
    lang,
    rng,
    config.morphology.paradigmMergeProbability * lang.conservatism,
  );
  if (merge) {
    pushEvent(lang, {
      generation,
      kind: "grammar_shift",
      description: merge.description,
    });
  }
}
