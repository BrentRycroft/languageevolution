/**
 * Phase 45a: lexicon-storage module.
 *
 * Owns: `Language.lexicon`, `Language.words`, `Language.wordsByFormKey`,
 *       `Language.wordOrigin`, `Language.lastChangeGeneration`,
 *       `Language.localNeighbors`, `Language.wordOriginChain`.
 *
 * The central data module — most other semantic modules depend on
 * it via `requires: ["semantic:lexicon"]`. Without it, there's no
 * vocabulary to operate on; with it, every other semantic module
 * is opt-in (a closed-isolate language can have a lexicon module
 * but no borrowing / calque / reborrow modules).
 *
 * Step: form-key index maintenance, lexicon size capping
 * (steps/lexicon.ts), origin-chain compaction.
 *
 * No realise hook — the realiser pulls forms via `Language.lexicon`
 * lookups directly. This module is a pure data + step owner.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface LexiconState {
  // Generation when the form-key index was last rebuilt; cooldown
  // for incremental vs full re-index.
  lastIndexGen: number;
}

const lexiconModule: SimulationModule<LexiconState> = {
  id: "semantic:lexicon",
  kind: "semantic",
  initState() {
    return { lastIndexGen: 0 };
  },
  step(_lang, _state, _ctx) {
    // Phase 45a: stub. Legacy steps/lexicon.ts continues to maintain
    // the form-key index + size cap. Will move here in Phase 46a.
  },
};

export function registerLexiconModule(): void {
  registerModule(lexiconModule);
}
