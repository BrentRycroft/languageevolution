/**
 * Phase 44d: agreement module.
 *
 * Owns: `Language.nounClassAssignments` (Phase 36b — the per-noun
 *       gender / class assignment table), gender features,
 *       person/number agreement features.
 *
 * Realiser: propagates agreement features from a controller (the
 * subject NP) to a target (the finite verb, predicate adjective,
 * agreeing determiner). Currently scattered:
 *   - realise.ts:280-289 (NP class assignment)
 *   - realise.ts:622-668 (VP class agreement on the verb head)
 *   - lexicon/nounClass.ts (assignAllNounClasses bootstrap)
 *
 * Step: gender drift, class-membership reshuffle (Phase 36b's
 * stochastic re-assignment), agreement strength erosion in contact
 * scenarios.
 *
 * `requires: ["morphological:paradigms"]` because agreement
 * features select paradigm slots; without the table, propagation
 * has nowhere to land.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface AgreementState {
  // Generation when nounClassAssignments was last bulk-rebalanced.
  // Cooldown source for class-shuffle events.
  lastRebalanceGen: number;
}

const agreementModule: SimulationModule<AgreementState> = {
  id: "morphological:agreement",
  kind: "morphological",
  requires: ["morphological:paradigms"],
  initState() {
    return { lastRebalanceGen: 0 };
  },
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 44d: stub. Legacy class-agreement code paths in
    // realise.ts:280-289 + realise.ts:622-668 continue to run.
    // Will absorb in Phase 46a.
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 44d: stub. nounClassAssignments shuffle / gender drift
    // continue to fire from steps/morphology.ts. Will move here in
    // Phase 46a.
  },
};

export function registerAgreementModule(): void {
  registerModule(agreementModule);
}
