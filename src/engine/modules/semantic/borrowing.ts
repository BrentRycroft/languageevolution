/**
 * Phase 45e (i): borrowing module.
 *
 * Owns: surface lexical borrowing — `tryBorrow` in
 *       contact/borrow.ts. When two languages are in sustained
 *       contact, one absorbs lemmas from the other (English
 *       absorbed thousands of French lexical items in the Norman
 *       period).
 *
 * Independently toggleable per language: a closed isolate disables
 * this module; an areal Sprachbund region activates it at boost
 * rate. Sister languages can have asymmetric borrowing rates
 * (a prestige-source language gives more than it takes).
 *
 * Step: per-gen contact-driven borrowing roll (gated on prestige
 * differential + contact intensity from steps/contact.ts).
 *
 * `requires: ["semantic:lexicon"]` — borrowed forms land in the
 * lexicon table.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface BorrowingState {
  // Generation when the last borrow event fired.
  lastBorrowGen: number;
}

const borrowingModule: SimulationModule<BorrowingState> = {
  id: "semantic:borrowing",
  kind: "semantic",
  requires: ["semantic:lexicon"],
  initState() {
    return { lastBorrowGen: 0 };
  },
  step(_lang, _state, _ctx) {
    // Phase 45e: stub. Legacy `tryBorrow` in contact/borrow.ts
    // continues to fire from steps/contact.ts. Will move here in
    // Phase 46a so closed-isolate languages can opt out cleanly.
  },
};

export function registerBorrowingModule(): void {
  registerModule(borrowingModule);
}
