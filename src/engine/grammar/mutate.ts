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
 */
export function setGrammarFeature<K extends keyof GrammarFeatures>(
  g: GrammarFeatures,
  key: K,
  value: GrammarFeatures[K],
): void {
  g[key] = value;
}
