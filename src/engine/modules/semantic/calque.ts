/**
 * Phase 45e (ii): calque module.
 *
 * Owns: structural / semantic calquing — `tryCalque` in
 *       contact/calque.ts (Phase 39m). A calque borrows the
 *       structure of a foreign expression while substituting
 *       native morphemes (German "Wolkenkratzer" calquing English
 *       "skyscraper" via "Wolke" + "kratzer").
 *
 * Different from surface borrowing (45e/i): calques import
 * **patterns** rather than forms, so they integrate cleanly with
 * native morphology + phonology.
 *
 * Step: per-gen contact-driven calque roll (lower base rate than
 * surface borrowing; calques need a pre-existing compound /
 * derivation pattern in the recipient).
 *
 * `requires: ["semantic:lexicon"]` — calqued lemmas land in the
 * lexicon table; will additionally consult the morphological
 * derivation module (44b) once Phase 46a wires the cross-kind
 * dependency in.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface CalqueState {
  // Generation when the last calque event fired.
  lastCalqueGen: number;
}

const calqueModule: SimulationModule<CalqueState> = {
  id: "semantic:calque",
  kind: "semantic",
  requires: ["semantic:lexicon"],
  initState() {
    return { lastCalqueGen: 0 };
  },
  step(_lang, _state, _ctx) {
    // Phase 45e: stub. Legacy `tryCalque` in contact/calque.ts
    // continues to fire from steps/contact.ts. Will move here in
    // Phase 46a.
  },
};

export function registerCalqueModule(): void {
  registerModule(calqueModule);
}
