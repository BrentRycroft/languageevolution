/**
 * Phase 45e (iii): reborrow module.
 *
 * Owns: structural reborrowing — `tryStructuralBorrow` in
 *       contact/structuralBorrow.ts (Phase 36m). A language can
 *       reborrow a form it once gave away (English "beef" from
 *       Norman French, itself from Old French "boef" → ultimately
 *       a cognate of English "cow"); or reborrow under different
 *       phonological shape after long contact.
 *
 * The module also covers the broader phenomenon of structural
 * features — alignment, word order, case marking — diffusing
 * across a Sprachbund. Independently toggleable so an isolate
 * sets all three contact modules off, while a Balkan-Sprachbund
 * region sets all three on.
 *
 * Step: per-gen reborrow roll (rare event; ~1/500 gens at base).
 *
 * `requires: ["semantic:lexicon"]` — reborrowed forms re-enter
 * the lexicon table.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface ReborrowState {
  // Generation when the last reborrow event fired.
  lastReborrowGen: number;
}

const reborrowModule: SimulationModule<ReborrowState> = {
  id: "semantic:reborrow",
  kind: "semantic",
  requires: ["semantic:lexicon"],
  initState() {
    return { lastReborrowGen: 0 };
  },
  step(_lang, _state, _ctx) {
    // Phase 45e: stub. Legacy `tryStructuralBorrow` in
    // contact/structuralBorrow.ts continues to fire. Will move
    // here in Phase 46a.
  },
};

export function registerReborrowModule(): void {
  registerModule(reborrowModule);
}
