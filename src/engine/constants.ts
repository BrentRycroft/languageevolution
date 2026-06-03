
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

// Phase 4e/6: per-non-basic-concept coinage pressure. Lowered 0.15 → 0.10 so
// the lexicon's BIRTH rate sits closer to the new low-frequency word-DEATH rate
// (stepObsolescence Phase 4e), nudging lexicon size toward stationary instead of
// only ever growing. (Full per-preset stationarity still needs calibration —
// see ROADMAP "lexicon size stationarity".)
export const EXPANSION_NEED_BASELINE = 0.10;
