/**
 * Phase 43a: SOV word-order strategy module.
 *
 * Owns the SOV branch of `Language.grammar.wordOrder`. Reorders
 * realised tokens so the verb appears clause-final after subject
 * and object (Latin / Japanese / Turkish / Korean / many SOV langs).
 *
 * Currently legacy in `translator/wordOrder.ts` (`sliceOrder` returns
 * `["S", "O", "V"]`) consumed at `translator/realise.ts:114`. This
 * module is the canonical owner once Phase 46a removes the legacy
 * branch; the hook is a stub that delegates to legacy for now.
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const sovModule: SimulationModule = {
  id: "syntactical:wordOrder/sov",
  kind: "syntactical",
  realiseStage: "order-tokens",
  realise(input, _lang, _state, ctx) {
    (ctx as Record<string, unknown>).order = ["S", "O", "V"];
    return input;
  },
};

export function registerSovModule(): void {
  registerModule(sovModule);
}
