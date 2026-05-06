import type { Language } from "../types";
import type { Rng } from "../rng";

/**
 * Soft enforcement of well-attested implicational universals (Greenberg /
 * WALS-style): when two coupled features are inconsistent, with low
 * probability nudge one toward the consistent value.
 *
 * Universals checked:
 *  U1: Verb-final (SOV) ↔ postpositional. SOV + preposition is rare; SVO/V-
 *      initial + postposition is rare. With pRepair we flip caseStrategy.
 *  U2: Verb-final (SOV) ↔ pre-noun modifiers. SOV + post-adjective and
 *      SOV + post-numeral are uncommon; nudge toward pre.
 *  U3: No morphological case ↔ nom-acc only. Already enforced as a hard
 *      constraint elsewhere; included here for completeness in tests.
 *
 * Returns the list of repairs that fired (for events / observability).
 */
export interface UniversalRepair {
  feature: keyof Language["grammar"];
  from: unknown;
  to: unknown;
  reason: string;
}

// Phase 39f: dropped 0.05 → 0.015. Greenberg's universals are
// statistical tendencies, not absolute laws. Real languages do
// violate them: Persian SOV with prepositions, Finnish SVO with
// postpositions, Mandarin SVO with both. Lowering the repair rate
// from 5%/gen to 1.5%/gen lets these "exception" configurations
// persist for centuries — modelling real typological diversity.
const REPAIR_PROBABILITY = 0.015;

export function enforceTypologicalUniversals(
  lang: Language,
  rng: Rng,
): UniversalRepair[] {
  const repairs: UniversalRepair[] = [];
  const g = lang.grammar;

  // U1: SOV ↔ postpositional
  if (g.wordOrder === "SOV" && g.caseStrategy === "preposition") {
    if (rng.chance(REPAIR_PROBABILITY)) {
      repairs.push({
        feature: "caseStrategy",
        from: "preposition",
        to: "postposition",
        reason: "SOV languages overwhelmingly use postpositions",
      });
      g.caseStrategy = "postposition";
    }
  } else if (
    (g.wordOrder === "VSO" || g.wordOrder === "VOS") &&
    g.caseStrategy === "postposition"
  ) {
    if (rng.chance(REPAIR_PROBABILITY)) {
      repairs.push({
        feature: "caseStrategy",
        from: "postposition",
        to: "preposition",
        reason: "Verb-initial languages overwhelmingly use prepositions",
      });
      g.caseStrategy = "preposition";
    }
  }

  // U2: SOV ↔ pre-modifiers (adjective, numeral)
  if (g.wordOrder === "SOV") {
    if (g.adjectivePosition === "post" && rng.chance(REPAIR_PROBABILITY)) {
      repairs.push({
        feature: "adjectivePosition",
        from: "post",
        to: "pre",
        reason: "SOV correlates with pre-noun adjectives",
      });
      g.adjectivePosition = "pre";
    }
    if (g.numeralPosition === "post" && rng.chance(REPAIR_PROBABILITY)) {
      repairs.push({
        feature: "numeralPosition",
        from: "post",
        to: "pre",
        reason: "SOV correlates with pre-noun numerals",
      });
      g.numeralPosition = "pre";
    }
  }

  return repairs;
}
