/**
 * Phase 44a: paradigm engine module.
 *
 * Owns: `Language.morphology.paradigms` — the flat
 *   `Partial<Record<MorphCategory, Paradigm>>` table at
 *   morphology/types.ts:56. Each paradigm is the inflectional rule
 *   for one slot (e.g., `noun.case.gen`, `verb.tense.past`).
 *
 * Realiser: applies paradigms to a stem in `realise-verb` (and is
 * also consulted from `realise-subject` for noun paradigms).
 * Delegates to `inflect`/`inflectCascade` from morphology/evolve.ts.
 *
 * The performance win: an isolating language (Toki Pona, Mandarin
 * surface-style) doesn't activate this module → realiser skips
 * paradigm dispatch entirely. Plan target ≥ 30% realiseVP cost cut
 * on isolating languages once Phase 46a inverts the default.
 *
 * Step: paradigm leveling, irregular smoothing, slot decay are all
 * driven by the analogy module (44e); this module owns the table
 * itself, not the dynamics that mutate it.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface ParadigmsState {
  // Generation when the paradigm table was last touched (any add /
  // remove / mutate). Diagnostic + cooldown source for analogy.
  lastMutationGen: number;
}

const paradigmsModule: SimulationModule<ParadigmsState> = {
  id: "morphological:paradigms",
  kind: "morphological",
  initState() {
    return { lastMutationGen: 0 };
  },
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 44a: stub. Legacy `inflect`/`inflectCascade` in
    // morphology/evolve.ts handles paradigm application today; this
    // hook is the canonical owner once Phase 46a removes the legacy
    // call sites in realise.ts:585-693 + realise.ts:280-298.
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 44a: stub. The analogy module (44e) drives table
    // mutations; this module is the data owner only.
  },
};

export function registerParadigmsModule(): void {
  registerModule(paradigmsModule);
}
