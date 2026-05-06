/**
 * Phase 42e: numerals module.
 *
 * Owns: `Language.grammar.numeralBase`
 *       (decimal / vigesimal / mixed-decimal-vigesimal / subtractive),
 *       `Language.grammar.numeralOrder`
 *       (big-small / small-big — German "fünfundzwanzig"-style).
 *
 * Realiser: routes a numeric token through `formatNumeral`
 * (translator/numerals.ts) to apply base + order. Currently in
 * sentence.ts:879-929 (NUM token handler). Phase 39k integrated
 * the helper; this module owns dispatch once Phase 46a removes
 * the legacy branch.
 *
 * Step: numeral-system shifts are diachronically rare (decimal
 * displaces vigesimal under contact pressure). Future work.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

const numeralsModule: SimulationModule = {
  id: "grammatical:numerals",
  kind: "grammatical",
  realiseStage: "realise-subject",
  realise(input) {
    // Phase 42e: stub. Legacy sentence.ts:879-929 handles NUM tokens.
    return input;
  },
};

export function registerNumeralsModule(): void {
  registerModule(numeralsModule);
}
