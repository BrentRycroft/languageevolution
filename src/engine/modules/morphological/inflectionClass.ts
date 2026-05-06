/**
 * Phase 44c: inflection-class module.
 *
 * Owns: Latin-style 1st/2nd/3rd conjugation classes
 *       (morphology/inflectionClass.ts) — partition of the verb
 *       lexicon into classes whose paradigms diverge.
 *
 * Realiser: when a stem belongs to a non-default class, the active
 * paradigm is selected from the class-specific table. Adds `class:N`
 * matchers in paradigm dispatch (currently inline in `inflect` at
 * morphology/evolve.ts:120-160).
 *
 * Step: paradigm leveling can collapse rare classes into the common
 * one (Latin 4th conjugation thinning out into Romance). The analogy
 * module (44e) drives the actual leveling; this module owns the
 * class-membership table.
 *
 * `requires: ["morphological:paradigms"]` because classes only make
 * sense when there's a paradigm table to partition.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface InflectionClassState {
  // Generation when class membership last shifted (a verb migrated
  // class, or a class collapsed into its neighbour). Diagnostic.
  lastShiftGen: number;
}

const inflectionClassModule: SimulationModule<InflectionClassState> = {
  id: "morphological:inflection-class",
  kind: "morphological",
  requires: ["morphological:paradigms"],
  initState() {
    return { lastShiftGen: 0 };
  },
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 44c: stub. Legacy class lookup in
    // morphology/inflectionClass.ts + morphology/evolve.ts:120-160
    // continues to handle dispatch. Will absorb in Phase 46a.
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 44c: stub. Class-membership shifts piggyback on analogy
    // (44e) today; this hook is the canonical owner once Phase 46a
    // moves the legacy logic in.
  },
};

export function registerInflectionClassModule(): void {
  registerModule(inflectionClassModule);
}
