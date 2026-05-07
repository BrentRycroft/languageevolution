/**
 * Phase 43b: tripartite alignment module.
 *
 * Owns the `alignment === "tripartite"` branch. S, A, and O each
 * get a distinct case marker — typologically rare; attested in
 * Nez Perce, Wangkumara, some Pama-Nyungan.
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const tripartiteModule: SimulationModule = {
  id: "syntactical:alignment/tripartite",
  kind: "syntactical",
  realiseStage: "resolve-alignment",
  realise(input, _lang, _state, ctx) {
    const c = ctx as Record<string, unknown>;
    const transitive = !!c.transitive;
    c.subjectCaseSlot = transitive ? "noun.case.erg" : "noun.case.abs";
    c.objectCaseSlot = transitive ? "noun.case.acc" : null;
    return input;
  },
};

export function registerTripartiteModule(): void {
  registerModule(tripartiteModule);
}
