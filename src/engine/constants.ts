/**
 * Cross-cutting calibration constants for the engine. Centralised here so
 * a single read of this file shows the calibration anchors that bind the
 * simulation to real-world linguistic timescales — and so future tweaks
 * touch one place rather than scattered magic numbers.
 *
 * Constants only belong here when they are:
 *  (a) referenced from more than one module, OR
 *  (b) a calibration anchor whose meaning would surprise a fresh reader
 *      seeing the literal in context.
 *
 * Local-only literals (e.g. a one-shot bias factor inside a single
 * scoring function) stay where they are.
 */

/**
 * Years that elapse during one generation step. 25 is the standard
 * demographic / linguistic figure (one human generation, cf. Pagel et
 * al. 2007 evolutionary tree-dating in 25y units). The simulation
 * surfaces this in tooltips ("gen 80 ≈ 2000y") so users can interpret
 * outputs against real diachronic data.
 *
 * Most per-generation rates downstream are calibrated against this
 * anchor: a 0.5 phonology rate, for example, targets ~1 regular sound
 * change per 200 years on average.
 */
export const YEARS_PER_GENERATION = 25;

/**
 * Maximum number of recent `LanguageEvent`s retained on a Language. Older
 * events are evicted to keep memory + render cost bounded. Re-exported
 * from `steps/helpers.ts` for backwards compatibility.
 */
export const MAX_EVENTS_PER_LANGUAGE = 80;

/**
 * Per-language tempo multiplier range. Each language samples a
 * conservatism in this band at birth; higher = more conservative
 * ("turtle"), lower = more innovative ("hare"). Multiplied into every
 * change-rate call.
 */
export const CONSERVATISM_MIN = 0.3;
export const CONSERVATISM_MAX = 1.8;

/**
 * Lexical-need baseline assigned to expansion-only concepts (those not
 * in BASIC_240). Lower than the cluster-coverage scores that drive
 * BASIC_240 coinage so the basic vocabulary fills first; non-zero so
 * tier-1+ vocabulary can still surface as a target for genesis.
 */
export const EXPANSION_NEED_BASELINE = 0.15;
