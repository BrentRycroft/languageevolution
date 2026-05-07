/**
 * Phase 43a / 46a-migration: SVO word-order strategy module.
 *
 * Owns the SVO branch (English, Mandarin, Romance, modern Germanic).
 * Replaces the SVO arm of `sliceOrder` in `translator/wordOrder.ts`.
 * The realise hook writes ["S", "V", "O"] into `ctx.order`. The
 * realiser uses that array; legacy `sliceOrder` is the fallback when
 * no wordOrder module is active.
 *
 * When `lang.grammar.wordOrder` drifts at runtime, `steps/grammar.ts`
 * deactivates this module and activates the new wordOrder module so
 * the realiser tracks drift correctly.
 */

import { registerModule } from "../../registry";
import type { SimulationModule } from "../../types";

const svoModule: SimulationModule = {
  id: "syntactical:wordOrder/svo",
  kind: "syntactical",
  realiseStage: "order-tokens",
  realise(input, _lang, _state, ctx) {
    (ctx as Record<string, unknown>).order = ["S", "V", "O"];
    return input;
  },
};

export function registerSvoModule(): void {
  registerModule(svoModule);
}
