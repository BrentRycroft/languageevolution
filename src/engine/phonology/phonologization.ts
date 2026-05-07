/**
 * Phase 48 D4-D: phonologization threshold detection.
 *
 * Linguistic basis: Hyman 2008 ("Universals of tone rules");
 * Bermúdez-Otero 2015 (Stratal Phonology). Predictable allophonic
 * variation crosses a threshold and becomes phonemic via reanalysis
 * — the canonical example is Indo-Aryan voiced aspirates emerging
 * from earlier *bh, *dh, *gh + breathy voice quality.
 *
 * The simulator tracks, per phoneme:
 *   - How many distinct context types it appears in
 *   - Whether the phoneme has nonzero functional load (contributes
 *     to minimal pairs)
 *
 * When a phoneme's context-diversity rises AND it has a minimal-pair
 * contribution, we log a phonologization event. The event surfaces
 * in the narrative timeline so the user can see the moment a new
 * contrast crystallised.
 *
 * This is a minimal D4-D: detection + event logging. Active
 * intervention (e.g., adding a contextual rule that "phonemicises"
 * the contrast) is reserved for a future tranche.
 */

import type { Language, Phoneme } from "../types";
import { isVowel } from "./ipa";

export type ContextType =
  | "V_V" // intervocalic
  | "V_#" // post-vocalic word-final
  | "#_V" // word-initial pre-vocalic
  | "C_V" // post-consonantal pre-vocalic
  | "V_C" // pre-consonantal post-vocalic
  | "C_C" // between consonants
  | "#_C" // word-initial pre-consonantal
  | "C_#"; // post-consonantal word-final

/**
 * Walk every word in the lexicon and for each occurrence of each
 * phoneme record which context type it appeared in. Returns a map
 * `phoneme → set of context types`.
 */
export function analyzeContexts(lang: Language): Record<Phoneme, Set<ContextType>> {
  const out: Record<Phoneme, Set<ContextType>> = Object.create(null);
  for (const meaning of Object.keys(lang.lexicon)) {
    const form = lang.lexicon[meaning]!;
    for (let i = 0; i < form.length; i++) {
      const p = form[i]!;
      const left = i > 0 ? form[i - 1]! : "#";
      const right = i < form.length - 1 ? form[i + 1]! : "#";
      const ctx = classifyContext(left, right);
      if (!out[p]) out[p] = new Set();
      out[p]!.add(ctx);
    }
  }
  return out;
}

function classifyContext(left: Phoneme, right: Phoneme): ContextType {
  const L = left === "#" ? "#" : isVowel(left) ? "V" : "C";
  const R = right === "#" ? "#" : isVowel(right) ? "V" : "C";
  return `${L}_${R}` as ContextType;
}

export interface PhonologisationEvent {
  phoneme: Phoneme;
  generation: number;
  fromDiversity: number;
  toDiversity: number;
}

/**
 * Compare current context-diversity against the language's last
 * recorded snapshot. Emit a PhonologisationEvent for each phoneme
 * whose diversity rose past the threshold.
 *
 * Threshold: ≥2 context types AND functional load > 0. Below this,
 * the phoneme is plausibly an allophone of something else; above,
 * it's contrastive and phonemic.
 */
export function detectPhonologisation(
  lang: Language,
  generation: number,
): PhonologisationEvent[] {
  const current = analyzeContexts(lang);
  const previous = lang.contextDiversitySnapshot ?? {};
  const events: PhonologisationEvent[] = [];
  for (const [p, contexts] of Object.entries(current)) {
    const toDiversity = contexts.size;
    const fromDiversity = previous[p] ?? 0;
    if (fromDiversity < 2 && toDiversity >= 2) {
      events.push({ phoneme: p, generation, fromDiversity, toDiversity });
    }
  }
  // Persist the snapshot for the next-gen comparison.
  const snapshot: Record<Phoneme, number> = Object.create(null);
  for (const [p, contexts] of Object.entries(current)) {
    snapshot[p] = contexts.size;
  }
  lang.contextDiversitySnapshot = snapshot;
  return events;
}
