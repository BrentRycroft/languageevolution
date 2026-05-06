/**
 * Phase 43b: nominative-accusative alignment module.
 *
 * Owns the `alignment === "nom-acc"` branch. S and A get nominative,
 * O gets accusative — the default for English, Latin, Greek,
 * Romance, Germanic, Slavic, most IE descendants.
 *
 * Currently legacy in `realise.ts:218-251`
 * (`alignmentSubjectCase` / `alignmentObjectCase`). This module is
 * the canonical owner once Phase 46a removes the legacy switch.
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const nomAccModule: SimulationModule = {
  id: "syntactical:alignment/nom-acc",
  kind: "syntactical",
  realiseStage: "resolve-alignment",
  realise(input) {
    return input;
  },
};

export function registerNomAccModule(): void {
  registerModule(nomAccModule);
}
