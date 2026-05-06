/**
 * Phase 42a: case-marking module.
 *
 * Owns: `Language.grammar.caseStrategy`, `Language.grammar.hasCase`,
 *       paradigms `noun.case.{nom,acc,gen,dat,loc,inst,abl,erg,abs}`.
 *
 * Realiser: when the language has a `caseSlot` resolved by alignment
 * dispatch and `hasCase` is true, applies the matching paradigm to
 * the head form. Today the legacy path in `realiseNP` (realise.ts:295)
 * does this work directly; this module is the canonical owner once
 * Phase 46a inverts the default and drops the legacy branch.
 *
 * Step: drift hook for `maybeCaseStrategyShift` (currently in
 * steps/grammar.ts:30 region). Models case-strategy reanalysis over
 * generations (case → preposition like Old → Modern English; or
 * the reverse Latin → Romance compensation of new prepositions
 * before case decay completed).
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface CaseMarkingState {
  // Generation when caseStrategy last drifted; used to enforce a
  // cooldown so case → preposition flip can't churn faster than
  // ~25 gens (matches Phase 39m drift cadence).
  lastDriftGen: number;
}

const caseMarkingModule: SimulationModule<CaseMarkingState> = {
  id: "grammatical:case-marking",
  kind: "grammatical",
  initState() {
    return { lastDriftGen: 0 };
  },
  realiseStage: "realise-subject",
  realise(input) {
    // Phase 42a: stub. The legacy path in realiseNP (realise.ts:295)
    // handles case-slot application today; this hook is the canonical
    // owner once Phase 46a removes the legacy branch. For now,
    // pass-through.
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 42a: stub. The legacy `maybeCaseStrategyShift` in
    // steps/grammar.ts handles drift today; this hook is the
    // canonical owner once Phase 46a removes the legacy call.
    // No-op for now — modules can be activated without breaking
    // anything because the legacy path still runs.
  },
};

export function registerCaseMarkingModule(): void {
  registerModule(caseMarkingModule);
}
