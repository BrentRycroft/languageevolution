/**
 * Phase 43c: adjective-placement module.
 *
 * Owns `Language.grammar.adjectivePosition` (pre / post).
 * Realiser picks where adjectives sit relative to the noun head.
 * Currently legacy in realise.ts:36 (parameter pickup) + scattered
 * across realiseNP. This module is the canonical owner once
 * Phase 46a removes the legacy branches.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const adjPlacementModule: SimulationModule = {
  id: "syntactical:adj-placement",
  kind: "syntactical",
  realiseStage: "realise-subject",
  realise(input) {
    return input;
  },
};

export function registerAdjPlacementModule(): void {
  registerModule(adjPlacementModule);
}
