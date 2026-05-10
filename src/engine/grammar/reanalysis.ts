import type { Language, GrammarFeatures } from "../types";
import type { Rng } from "../rng";
import type { GrammarShift } from "./evolve";

/**
 * reanalysis.ts — Phase 72g T4.
 *
 * Reanalysis mechanisms for alignment + grammaticalisation. Pre-72g
 * grammar features changed via random uniform drift across the
 * available alignment values (nom-acc / erg-abs / tripartite / split-S).
 * Real reanalysis is causally driven:
 *
 *   - nom-acc + passive construction frequent → speakers reinterpret
 *     "agent-by-X" as required → erg-abs emerges. (Indo-Aryan,
 *     Polynesian, Hindi-Urdu pattern.)
 *   - erg-abs + intransitive subject conflated with patient → split-S
 *     emerges where animacy gates split.
 *   - SOV + post-verbal serial verbs → reanalysed as auxiliaries
 *     (Korean, Japanese, Mandarin pattern); not yet shipped here.
 *
 * This module ships the alignment-reanalysis trigger; the grammaticali-
 * sation-reanalysis path stays as a hook documented but not yet wired.
 */

interface AlignmentReanalysisInput {
  /** True when the language has a productive passive construction
   *  (proxy: `grammar.voice` includes "passive", or hasCase is true and
   *  alignment is nom-acc — the passive trigger is implicit in real
   *  Indo-Aryan history). */
  hasPassive: boolean;
  /** True when the case-marked agent in passive is morphologically
   *  obligatory in the recipient language (proxy: hasCase + tier ≥ 1). */
  agentObligatory: boolean;
  /** Generations since the last alignment flip — older configurations
   *  reanalyse less often (settled grammar resists). */
  generationsSinceFlip: number;
}

/**
 * Read a language's reanalysis-input snapshot. We approximate the
 * conditions from existing fields — the simulator doesn't track passive
 * voice yet, so we use a gated proxy.
 */
function reanalysisInput(lang: Language): AlignmentReanalysisInput {
  const tier = lang.culturalTier ?? 0;
  const hasCase = lang.grammar.hasCase === true;
  return {
    hasPassive: hasCase && tier >= 1,
    agentObligatory: hasCase && tier >= 1,
    generationsSinceFlip: 50, // proxy; could read a `lastAlignmentFlipGen` field if we add it
  };
}

/**
 * Try a reanalysis-driven alignment shift. Returns the shift event or
 * null. Triggered at low probability when conditions are met:
 *
 *   nom-acc + hasPassive + agentObligatory → erg-abs (1.5%/gen).
 *   erg-abs + low animacy distinction → split-S (1.0%/gen).
 *
 * Caller (grammar/evolve.ts) decides when to consult this; we suggest
 * running it before the random alignment-drift rule, so reanalysis
 * paths take precedence when their conditions are met.
 */
export function tryReanalyseAlignment(
  lang: Language,
  rng: Rng,
): GrammarShift | null {
  const input = reanalysisInput(lang);
  const current = lang.grammar.alignment ?? "nom-acc";

  if (current === "nom-acc" && input.hasPassive && input.agentObligatory) {
    if (rng.chance(0.015)) {
      const next: NonNullable<GrammarFeatures["alignment"]> = "erg-abs";
      lang.grammar.alignment = next;
      return {
        feature: "alignment",
        from: current,
        to: next,
      };
    }
  }

  if (current === "erg-abs" && rng.chance(0.01)) {
    const next: NonNullable<GrammarFeatures["alignment"]> = "split-S";
    lang.grammar.alignment = next;
    return { feature: "alignment", from: current, to: next };
  }

  return null;
}
