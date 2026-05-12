import type { GrammarFeatures } from "../types";

/**
 * Phase 29-2d: typed setter for a single GrammarFeatures field.
 *
 * Pre-29-2d two sites cast through `as unknown as Record<string, unknown>`
 * to write a feature whose key was variable-typed (`tree/founder.ts:72`,
 * `steps/arealTypology.ts:74`). The casts bypassed every per-feature
 * value type check; a misspelled key or wrong-type value would compile.
 *
 * This helper preserves the variable-key pattern the call-sites need
 * while keeping a single explicit narrow assertion in one place. The
 * signature requires the value to be assignable to the field's type.
 *
 * ⚠ FOOTGUN — wordOrder mutation (Phase 72 methodological audit C5).
 *
 * Writing `lang.grammar.wordOrder = "SOV"` (directly or via this
 * helper) does NOT update the active wordOrder module. The realiser
 * reads order from the active `syntactical:wordOrder/*` module's
 * `order-tokens` stage output (realise.ts:154-161); only when no
 * such module is active does it fall back to
 * `sliceOrder(lang.grammar.wordOrder)`.
 *
 * Symptom: presets that activate `syntactical:wordOrder/svo` (e.g.
 * Romance) will keep emitting SVO output even after mutating the
 * grammar field to "SOV", "VSO", etc.
 *
 * Correct pattern when mutating wordOrder at runtime:
 *   1. Write the field: `setGrammarFeature(lang.grammar, "wordOrder", v)`.
 *   2. Swap the active module: remove the old
 *      `syntactical:wordOrder/<old>` from `lang.activeModules` and add
 *      the matching `syntactical:wordOrder/<new>`.
 *
 * Test workaround (Phase 72g architecture test): clear all
 * `syntactical:wordOrder/*` entries from `lang.activeModules` to
 * exercise the fallback path. Production callers should swap, not
 * clear.
 *
 * A wrapper that does both — `setWordOrderAndSwapModule(lang, v)` —
 * is a future addition; doing it here would require widening the
 * helper's parameter type from GrammarFeatures to Language, which
 * affects every existing caller.
 */
export function setGrammarFeature<K extends keyof GrammarFeatures>(
  g: GrammarFeatures,
  key: K,
  value: GrammarFeatures[K],
): void {
  g[key] = value;
}
