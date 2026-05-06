/**
 * Phase 43c: numeral-placement module.
 *
 * Owns `Language.grammar.numeralPosition` (pre / post).
 * Realiser places numerals before or after the head noun.
 * Currently legacy in realise.ts:38.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const numPlacementModule: SimulationModule = {
  id: "syntactical:num-placement",
  kind: "syntactical",
  realiseStage: "realise-subject",
  realise(input) {
    return input;
  },
};

export function registerNumPlacementModule(): void {
  registerModule(numPlacementModule);
}
