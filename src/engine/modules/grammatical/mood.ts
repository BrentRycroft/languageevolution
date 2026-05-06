/**
 * Phase 42d: mood module.
 *
 * Owns: `Language.grammar.moodMarking`
 *       (declarative / subjunctive / imperative / conditional /
 *        optative / jussive / irrealis / dubitative / hortative —
 *        Phase 36e+l), paradigms `verb.mood.*`.
 *
 * Realiser: pushes the matching mood `MorphCategory` onto the verb
 * inflection stack. Currently spread across realise.ts:600-620 and
 * sentence.ts:701-740 (mood overrides for subordinate clauses).
 *
 * Step: `maybeMoodEmergence` — subordinator clitic grammaticalises
 * into a mood prefix (Phase 36e). Currently steps/grammar.ts.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const moodModule: SimulationModule = {
  id: "grammatical:mood",
  kind: "grammatical",
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 42d: stub. Legacy realise.ts:600-620 handles mood
    // morph-cat push today.
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 42d: stub. maybeMoodEmergence continues to fire from
    // steps/grammar.ts.
  },
};

export function registerMoodModule(): void {
  registerModule(moodModule);
}
