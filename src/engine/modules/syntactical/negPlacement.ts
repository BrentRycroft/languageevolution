/**
 * Phase 43c: negation-placement module.
 *
 * Owns `Language.grammar.negationPosition` (pre-verb / post-verb /
 * clause-final) — French ne...pas style is post-verb; English
 * "doesn't" pre-verb; Cushitic clause-final.
 *
 * Currently legacy in realise.ts:39 + scattered.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const negPlacementModule: SimulationModule = {
  id: "syntactical:neg-placement",
  kind: "syntactical",
  realiseStage: "realise-verb",
  realise(input) {
    return input;
  },
};

export function registerNegPlacementModule(): void {
  registerModule(negPlacementModule);
}
