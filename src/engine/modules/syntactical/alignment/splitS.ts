/**
 * Phase 43b: split-S (active-stative) alignment module.
 *
 * Owns the `alignment === "split-S"` branch. Intransitive subjects
 * (S) split between A-marking and O-marking based on agency or
 * volitionality — Lakhota, Choctaw, Guarani, Acehnese.
 *
 * This module is reserved for Phase 46a's full alignment migration;
 * the legacy `alignmentSubjectCase` (realise.ts:218) currently
 * collapses split-S to the same case as accusative.
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const splitSModule: SimulationModule = {
  id: "syntactical:alignment/split-s",
  kind: "syntactical",
  realiseStage: "resolve-alignment",
  realise(input) {
    return input;
  },
};

export function registerSplitSModule(): void {
  registerModule(splitSModule);
}
