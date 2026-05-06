/**
 * Phase 43c: possessor-placement module.
 *
 * Owns `Language.grammar.possessorPosition` (pre / post).
 * Realiser places possessor NPs before or after the head.
 * Currently legacy in realise.ts:37.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const possPlacementModule: SimulationModule = {
  id: "syntactical:poss-placement",
  kind: "syntactical",
  realiseStage: "realise-subject",
  realise(input) {
    return input;
  },
};

export function registerPossPlacementModule(): void {
  registerModule(possPlacementModule);
}
