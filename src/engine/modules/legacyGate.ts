/**
 * Phase 46a-migration: legacy-flag → module-presence gating helper.
 *
 * Most consumers in the engine read `lang.grammar.X` to decide
 * whether to run a feature's code path. The migration's goal is to
 * make `lang.activeModules` the source of truth for "is this feature
 * active?", while keeping the legacy flat flags as the back-compat
 * fallback for languages that don't opt into modules.
 *
 * `isFeatureActive(lang, moduleId, legacyCheck)` returns:
 *   - When `lang.activeModules` is a Set: whether `moduleId` is in
 *     the set. The legacy flag is ignored — module presence is the
 *     single source of truth.
 *   - When `lang.activeModules` is missing or not a Set: falls back
 *     to `legacyCheck(lang)` for back-compat.
 *
 * The pattern lets each consumer migrate its gating in one line:
 *   `if (lang.grammar.hasCase)` → `if (isFeatureActive(lang, "grammatical:case-marking", l => l.grammar.hasCase))`
 *
 * The actual feature *value* (e.g., "free" vs "enclitic" article
 * placement) still comes from `lang.grammar.X` until per-value
 * modules land.
 */

import type { Language } from "../types";

export function isFeatureActive(
  lang: Language,
  moduleId: string,
  legacyCheck: (lang: Language) => boolean,
): boolean {
  if (lang.activeModules instanceof Set) {
    return lang.activeModules.has(moduleId);
  }
  return legacyCheck(lang);
}
