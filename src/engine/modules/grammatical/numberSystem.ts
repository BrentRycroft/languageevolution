/**
 * Phase 42c: number-system module.
 *
 * Owns: `Language.grammar.numberSystem`
 *       (none / sg-pl / sg-du-pl / sg-du-pa-pl),
 *       `Language.grammar.pluralMarking`
 *       (none / affix / reduplication),
 *       paradigms `noun.num.{pl,du,pauc}`.
 *
 * Realiser: pluralises the head form via the active strategy.
 * Currently legacy in realise.ts:288-298. Reduplication helper at
 * `morphology/reduplication.ts` (Phase 36a).
 *
 * Step: dual decay — daughter languages of `sg-du-pl` parents lose
 * the dual over time (PIE → Latin → Romance trajectory). Currently
 * not implemented as a discrete event; the module owns this when
 * Phase 46a lands.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface NumberSystemState {
  // Generation when dual was last reinforced; once it ages past
  // ~80 gens with low dual usage in the lexicon, the system
  // collapses to sg-pl.
  dualReinforcedAt: number;
}

const numberSystemModule: SimulationModule<NumberSystemState> = {
  id: "grammatical:number-system",
  kind: "grammatical",
  initState(lang) {
    return {
      dualReinforcedAt: lang.grammar.numberSystem === "sg-du-pl" || lang.grammar.numberSystem === "sg-du-pa-pl" ? 0 : -1,
    };
  },
  realiseStage: "realise-subject",
  realise(input) {
    // Phase 42c: stub. Legacy realise.ts:288-298 handles plural
    // marking today.
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 42c: stub. Dual decay pathway (PIE → Romance) not yet
    // implemented as a discrete event. Future home here.
  },
};

export function registerNumberSystemModule(): void {
  registerModule(numberSystemModule);
}
