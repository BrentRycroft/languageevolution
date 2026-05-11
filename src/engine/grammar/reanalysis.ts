import type { GrammarFeatures } from "../types";
import type { Rng } from "../rng";
import type { GrammarShift } from "./evolve";
import type { GrammarState, SocialState } from "../domains";

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

/**
 * Phase 72 code-review fix A2: 50-gen cooldown between alignment
 * reanalysis flips. Mirror of T72a-5's wordOrderLastFlipGen pattern.
 * Without this, the function could ping-pong nom-acc → erg-abs →
 * split-S → ... while conditions remained met.
 */
const ALIGNMENT_REANALYSIS_COOLDOWN = 50;

interface AlignmentReanalysisInput {
  /** True when the language has a productive passive construction
   *  (proxy: `grammar.voice` includes "passive", or hasCase is true and
   *  alignment is nom-acc — the passive trigger is implicit in real
   *  Indo-Aryan history). */
  hasPassive: boolean;
  /** True when the case-marked agent in passive is morphologically
   *  obligatory in the recipient language (proxy: hasCase + tier ≥ 1). */
  agentObligatory: boolean;
}

function reanalysisInput(lang: GrammarState & SocialState): AlignmentReanalysisInput {
  const tier = lang.culturalTier ?? 0;
  const hasCase = lang.grammar.hasCase === true;
  return {
    hasPassive: hasCase && tier >= 1,
    agentObligatory: hasCase && tier >= 1,
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
 *
 * Cooldown: 50 gens between flips. Caller must pass `generation` so
 * the cooldown can be checked; the function writes
 * `lang.alignmentLastFlipGen` on each successful flip.
 */
export function tryReanalyseAlignment(
  lang: GrammarState & SocialState,
  rng: Rng,
  generation: number = 0,
): GrammarShift | null {
  const lastFlip = lang.alignmentLastFlipGen ?? -ALIGNMENT_REANALYSIS_COOLDOWN;
  if (generation - lastFlip < ALIGNMENT_REANALYSIS_COOLDOWN) return null;

  const input = reanalysisInput(lang);
  const current = lang.grammar.alignment ?? "nom-acc";

  if (current === "nom-acc" && input.hasPassive && input.agentObligatory) {
    if (rng.chance(0.015)) {
      const next: NonNullable<GrammarFeatures["alignment"]> = "erg-abs";
      lang.grammar.alignment = next;
      lang.alignmentLastFlipGen = generation;
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
    lang.alignmentLastFlipGen = generation;
    return { feature: "alignment", from: current, to: next };
  }

  return null;
}
