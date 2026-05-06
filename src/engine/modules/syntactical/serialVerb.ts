/**
 * Phase 43d: serial-verb-construction module.
 *
 * Owns `Language.grammar.serialVerbConstructions` (boolean).
 * In SVC languages, multiple verbs chain in sequence sharing
 * subject + arguments without an explicit conjunction —
 * Vietnamese, Yoruba, Mandarin, many Niger-Congo + Southeast Asian.
 *
 * Currently legacy in realise.ts:145-148 (`dropForSVC` flag drops
 * the conjunction "and" between verb-pairs when SVC is on).
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const serialVerbModule: SimulationModule = {
  id: "syntactical:serial-verb",
  kind: "syntactical",
  realiseStage: "realise-verb",
  realise(input) {
    return input;
  },
};

export function registerSerialVerbModule(): void {
  registerModule(serialVerbModule);
}
