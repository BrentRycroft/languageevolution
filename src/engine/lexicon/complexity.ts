import type { Meaning } from "../types";

/**
 * Rough semantic complexity / abstractness on a 1..5 scale.
 *  1 — concrete body part, pronoun, primary colour, count-word.
 *  2 — everyday physical object or basic action.
 *  3 — broader ordinary noun/verb (weather, kin beyond immediate).
 *  4 — evaluative adjective, relational concept.
 *  5 — highly abstract (truth, memory, idea). Uncommon in the seed lexicon.
 *
 * Used to bias genesis (longer forms for abstract meanings) and obsolescence
 * (abstract words resist retirement because they have less casual pressure).
 */
export const COMPLEXITY: Record<Meaning, number> = {
  // Body & person (1)
  hand: 1, foot: 1, heart: 1, head: 1, eye: 1, ear: 1, mouth: 1,
  tooth: 1, bone: 1, blood: 1, hair: 1,
  mother: 1, father: 1,
  // Numbers & quantifiers (1)
  one: 1, two: 1, three: 1,
  // Core environment (2)
  water: 2, fire: 2, stone: 2, tree: 2, sun: 2, moon: 2, star: 2, night: 2,
  // Animals (2)
  dog: 2, wolf: 2, horse: 2, cow: 2, fish: 2, bird: 2, snake: 2,
  // Core actions (2)
  go: 2, come: 2, see: 2, know: 3, eat: 2, drink: 2, sleep: 2, die: 2,
  // Evaluative / relational (3-4)
  big: 3, small: 3, new: 3, old: 3, good: 3, bad: 3,
};

export const DEFAULT_COMPLEXITY = 2;

export function complexityFor(meaning: Meaning): number {
  const direct = COMPLEXITY[meaning];
  if (direct !== undefined) return direct;
  // Compounds and derivations inherit the max of their parts + 1 (bounded).
  if (meaning.includes("-")) {
    const parts = meaning.split("-");
    let max = DEFAULT_COMPLEXITY;
    for (const p of parts) {
      const c = COMPLEXITY[p];
      if (c !== undefined && c > max) max = c;
    }
    return Math.min(5, max + 1);
  }
  if (/-(er|ness|ic|al|ine|intens)$/.test(meaning)) {
    const base = meaning.replace(/-(er|ness|ic|al|ine|intens)$/, "");
    const c = COMPLEXITY[base];
    if (c !== undefined) return Math.min(5, c + 1);
  }
  return DEFAULT_COMPLEXITY;
}
