/**
 * Phase 45b: cluster registry module.
 *
 * Owns: semantic-cluster mappings (currently hardcoded in
 *       semantics/clusters.ts:1-194). A cluster groups related
 *       lemmas (kinship, body parts, motion verbs, colours) so that
 *       loss / borrowing / drift can target a coherent semantic
 *       neighbourhood rather than a single random word.
 *
 * Modules can register their own clusters at boot — e.g., a
 * "kinship-rich preset" can register a deeper kinship cluster
 * before the simulation starts. The registry is global at module
 * boot time but per-language activation is opt-in.
 *
 * No realise hook — clusters are consulted from step-time
 * mechanisms (taboo replacement, colexification, synonym
 * propagation), not from realisation.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface ClustersState {
  // Generation when cluster membership last shifted (a lemma
  // joined or left a cluster). Diagnostic for cluster churn.
  lastMembershipGen: number;
}

const clustersModule: SimulationModule<ClustersState> = {
  id: "semantic:clusters",
  kind: "semantic",
  initState() {
    return { lastMembershipGen: 0 };
  },
  step(_lang, _state, _ctx) {
    // Phase 45b: stub. Cluster mappings are static today (loaded
    // from semantics/clusters.ts at module load). Per-language
    // membership churn is not a current mechanism; this hook is
    // reserved for Phase 46a + future cluster-drift work.
  },
};

export function registerClustersModule(): void {
  registerModule(clustersModule);
}
