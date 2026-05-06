/**
 * Phase 42e: demonstratives module.
 *
 * Owns: `Language.grammar.demonstrativeDistance`
 *       (two-way / three-way / four-way — Phase 36c+i),
 *       closed-class lemmas `that`, `that_near`, `that_far`,
 *       `that_remote`.
 *
 * Realiser: routes demonstrative determiners through closedClass
 * with distance hint. Currently in closedClass.ts:118-138
 * (`remapDemonstrative`).
 *
 * Step: demonstrative-system shifts (two-way → three-way splits
 * via grammaticalisation of locative adverb "yonder"). Future
 * work.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const demonstrativesModule: SimulationModule = {
  id: "grammatical:demonstratives",
  kind: "grammatical",
  realiseStage: "realise-subject",
  realise(input) {
    // Phase 42e: stub. Legacy closedClass.ts:118-138 handles
    // distance routing.
    return input;
  },
};

export function registerDemonstrativesModule(): void {
  registerModule(demonstrativesModule);
}
