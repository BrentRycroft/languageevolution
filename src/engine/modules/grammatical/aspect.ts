/**
 * Phase 42d: aspect module.
 *
 * Owns: `Language.grammar.aspectSystem`
 *       (simple / pfv-ipfv / prog / rich), paradigms
 *       `verb.aspect.{pfv,ipfv,prog,hab,perf,prosp}`.
 *
 * Realiser: pushes the matching `MorphCategory` onto the verb
 * inflection stack (legacy in realise.ts:594-668). Composer-driven
 * aspect choice currently in narrative/composer.ts:51-679.
 *
 * Step: aspect-system drift over generations
 * (simple → prog → rich is one attested trajectory: English).
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const aspectModule: SimulationModule = {
  id: "grammatical:aspect",
  kind: "grammatical",
  realiseStage: "realise-verb",
  realise(input) {
    // Phase 42d: stub. Legacy realise.ts:594-668 handles aspect
    // morph-cat push today.
    return input;
  },
};

export function registerAspectModule(): void {
  registerModule(aspectModule);
}
