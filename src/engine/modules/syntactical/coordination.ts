/**
 * Phase 43d: coordination module.
 *
 * Owns coordinate-clause strategy — explicit conjunction word
 * (English "and"/"or") vs juxtaposition (some Polynesian, some
 * Sino-Tibetan use silent juxtaposition for coordinated clauses).
 *
 * Currently legacy in realise.ts:124-153 (`isAnd` flag handling).
 * Coordination type today is implicit; the module owns the
 * strategy switch once `Language.grammar.coordinationStrategy` is
 * added (future field, Phase 46a or later).
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const coordinationModule: SimulationModule = {
  id: "syntactical:coordination",
  kind: "syntactical",
  realiseStage: "order-tokens",
  realise(input) {
    return input;
  },
};

export function registerCoordinationModule(): void {
  registerModule(coordinationModule);
}
