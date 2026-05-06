/**
 * Phase 41c: realiser pipeline.
 *
 * The legacy `realiseSentence` (translator/realise.ts:27) is a single
 * 766-line function that hardcodes word-order, alignment, NP/VP
 * realisation, and post-processing. Pre-Phase-41 every consumer
 * checks every flag; pre-Phase-42 there's no module dispatch.
 *
 * This file introduces the **stage hook** mechanism. The legacy body
 * stays in place for back-compat; at each structural milestone, it
 * calls `runRealiseStage(stage, ...)` so registered modules can
 * inject behavior. Phases 42-45 migrate the legacy body's contents
 * into modules, one stage at a time. Phase 46 deletes the legacy
 * branches once every preset has migrated.
 *
 * Stages map to existing milestones in `realiseSentence`:
 *
 *   populate-forms     → `populateForms` (realise.ts:736-765)
 *   resolve-alignment  → alignment dispatch (realise.ts:218-251)
 *   realise-subject    → realiseNP for subject (realise.ts:46)
 *   realise-verb       → realiseVerb (realise.ts:563-734)
 *   realise-object     → realiseNP for object (realise.ts:62-87)
 *   realise-pps        → realisePP (realise.ts:75-77)
 *   order-tokens       → wordOrder dispatch (realise.ts:114-153)
 *   post-process       → interrogative + Q particles (realise.ts:154-216)
 *
 * Modules declare `realiseStage: "X"` + `realise(input, lang, state, ctx)`.
 * `runRealiseStage` walks `activeModulesOf(lang)`, filters by stage,
 * calls each module's hook in topo order, and returns the final
 * payload. When no module is registered for the stage, returns
 * `payload` unchanged — the legacy code continues to do the work.
 */

import type { Language } from "../types";
import type { RealiseStage } from "../modules/types";
import { activeModulesOf } from "../modules/registry";
import { timeRealise } from "../modules/profile";

export interface PipelinePayload {
  /** Mutable accumulator for whatever the stage produces. */
  data: unknown;
  /** Stage-local context modules can read. */
  meta: Record<string, unknown>;
}

/**
 * Run all module realise hooks registered for `stage` in topo order.
 * Each hook receives the current payload and returns a (possibly
 * mutated) payload that flows to the next module. Returns the
 * payload unchanged when the language has no active modules or when
 * no active module declared this stage.
 */
export function runRealiseStage(
  stage: RealiseStage,
  lang: Language,
  payload: PipelinePayload,
): PipelinePayload {
  if (!lang.activeModules || lang.activeModules.size === 0) return payload;
  if (!lang.moduleState) return payload;
  const modules = activeModulesOf(lang);
  let current = payload;
  for (const m of modules) {
    if (m.realiseStage !== stage) continue;
    if (!m.realise) continue;
    const state = lang.moduleState[m.id];
    // Phase 46b: time the hook. `timeRealise` is a no-op when
    // profiling is disabled.
    const next = timeRealise(m.id, () =>
      m.realise!(current.data, lang, state, current.meta),
    );
    current = { data: next ?? current.data, meta: current.meta };
  }
  return current;
}
