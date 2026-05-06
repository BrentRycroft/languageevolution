/**
 * Phase 45d (i): synonymy module.
 *
 * Owns: Phase 37's machinery — `addSynonym`, `selectSynonyms`,
 *       `pickSynonym`, `maybeReplacePrimary`. Each lemma can carry
 *       a stack of synonym senses; the realiser picks one per
 *       utterance based on register + recency.
 *
 * Step: synonym genesis (a near-cluster lemma sprouts a synonym
 * sense), homonym suppression (when two lemmas converge to the
 * same form, the lower-frequency one is suppressed) — currently
 * in steps/grammar.ts:218-258.
 *
 * Phase 40b's variant-gating machinery (`lexicon/variants.ts`)
 * also feeds into this module: variant forms are consumed as
 * synonym candidates, and the gating thresholds read from the
 * frequency module.
 *
 * `requires: ["semantic:lexicon", "semantic:frequency"]` because
 * synonym competition is frequency-weighted.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface SynonymyState {
  // Generation when the last synonym genesis fired; cooldown.
  lastGenesisGen: number;
}

const synonymyModule: SimulationModule<SynonymyState> = {
  id: "semantic:synonymy",
  kind: "semantic",
  requires: ["semantic:lexicon", "semantic:frequency"],
  initState() {
    return { lastGenesisGen: 0 };
  },
  realiseStage: "populate-forms",
  realise(input) {
    // Phase 45d: stub. Legacy `pickSynonym` / `selectSynonyms` in
    // populate-forms code paths continue to fire. Will absorb in
    // Phase 46a.
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 45d: stub. Legacy synonym-genesis + homonym-suppression
    // in steps/grammar.ts:218-258 continue to fire. Will move here
    // in Phase 46a.
  },
};

export function registerSynonymyModule(): void {
  registerModule(synonymyModule);
}
