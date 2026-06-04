
/**
 * constants.ts
 *
 * tunable engine-wide constants (years/gen, etc.). Key exports: YEARS_PER_GENERATION, MAX_EVENTS_PER_LANGUAGE, CONSERVATISM_MIN.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const YEARS_PER_GENERATION = 25;

export const MAX_EVENTS_PER_LANGUAGE = 80;

export const CONSERVATISM_MIN = 0.3;
export const CONSERVATISM_MAX = 1.8;

// Lane B (lexicon lifecycle, MEGA-OVERHAUL #7): communicative-need-driven birth.
//
// Pre-Lane-B a flat EXPANSION_NEED_BASELINE (0.10) was added to EVERY non-basic
// registry concept until acquired, so every language filled toward the WHOLE
// CONCEPT_IDS registry and settled at a ~1800-word EXOGENOUS TARGET regardless of
// culture. That is the bug. The baseline is now tiny (a faint "this slot exists"
// pull) and is GATED by a per-language registry-fill cap (REGISTRY_FILL_CAP): once
// a language has filled its cap fraction of the tier-accessible registry, the
// baseline pull drops to zero. Real birth pressure now comes from COMMUNICATIVE
// NEED — recent topics, sister-language presence, cluster coverage, cultural tier —
// not from a concept merely existing. A minimalist / early-tier culture stays small.
export const EXPANSION_NEED_BASELINE = 0.02;

// Lane B: per-language cap on how much of the tier-accessible universal registry a
// language fills, as a FRACTION of the concepts at or below the language's cultural
// tier. Below the cap the faint EXPANSION_NEED_BASELINE pull applies (so the lexicon
// CAN grow under sustained pressure); at/above it the baseline pull is zero (only
// genuine communicative need — topics, sisters, cluster gaps — can still coin). This
// replaces the implicit "fill the whole registry" target with an emergent ceiling
// that scales with cultural complexity. Tier 0 forager cultures name a small slice
// of the world; modern cultures name far more.
export const REGISTRY_FILL_CAP: Record<0 | 1 | 2 | 3, number> = {
  0: 0.40,
  1: 0.45,
  2: 0.50,
  3: 0.55,
};
