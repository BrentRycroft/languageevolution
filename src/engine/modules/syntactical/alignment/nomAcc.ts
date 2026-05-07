/**
 * Phase 43b / 46a-migration: nominative-accusative alignment module.
 *
 * Owns S/A/O case-slot resolution under nom-acc alignment. S and A
 * get nominative (no overt slot in the simulator), O gets accusative.
 *
 * Realise hook writes `ctx.subjectCaseSlot` + `ctx.objectCaseSlot`.
 * `meta.transitive` is read off ctx (the realiser sets it before
 * dispatching). The realiser uses these values; the legacy
 * `alignmentSubjectCase`/`alignmentObjectCase` switch is the
 * back-compat fallback.
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const nomAccModule: SimulationModule = {
  id: "syntactical:alignment/nom-acc",
  kind: "syntactical",
  realiseStage: "resolve-alignment",
  realise(input, _lang, _state, ctx) {
    const c = ctx as Record<string, unknown>;
    const transitive = !!c.transitive;
    c.subjectCaseSlot = null;
    c.objectCaseSlot = transitive ? "noun.case.acc" : null;
    return input;
  },
};

export function registerNomAccModule(): void {
  registerModule(nomAccModule);
}
