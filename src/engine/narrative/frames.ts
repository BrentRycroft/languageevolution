import type { Meaning } from "../types";

/**
 * Phase 29 Tranche 5g: semantic-frame coherence for narrative slot
 * filling. Maps each (transitive) verb to the broad semantic class
 * its object should belong to. Pre-fix the slot picker chose objects
 * uniformly from `OBJECT_NOUN_POOL`, producing nonsense like "took
 * the color with the village" or "did not drink the start".
 *
 * Coverage is deliberately partial: only the verbs most prone to
 * weird combinations get a frame. The picker still falls back to the
 * full pool when no frame is recorded — better an unconstrained pick
 * than no narrative at all.
 *
 * Semantic classes:
 *   - `liquid`     — drink-objects (water, milk, wine)
 *   - `food`       — eat-objects (bread, meat, fruit, grain)
 *   - `animate`    — see/hear/know-style objects (person, animal)
 *   - `inanimate`  — generic concrete (stone, knife, house)
 *   - `tool`       — wield/take-style instruments (knife, spear, rope)
 *   - `creature`   — hunt/fight-style targets
 *   - `abstract`   — think/say-style objects (truth, name, word)
 *   - `place`      — go/come-style locatives
 *
 * Meanings carry one or more classes via `MEANING_CLASSES`; verbs
 * pick which class(es) their object should match via `VERB_FRAMES`.
 */

export type SemanticClass =
  | "liquid"
  | "food"
  | "animate"
  | "inanimate"
  | "tool"
  | "creature"
  | "abstract"
  | "place"
  | "body-part";

const MEANING_CLASSES: Record<Meaning, ReadonlyArray<SemanticClass>> = {
  // Liquids
  water: ["liquid", "inanimate"],
  milk: ["liquid", "food"],
  wine: ["liquid", "food"],
  blood: ["liquid", "body-part"],
  // Foods
  bread: ["food", "inanimate"],
  meat: ["food"],
  fruit: ["food", "inanimate"],
  grain: ["food", "inanimate"],
  salt: ["food", "inanimate"],
  // Animals (creatures + animate)
  dog: ["animate", "creature"],
  wolf: ["animate", "creature"],
  horse: ["animate", "creature"],
  bear: ["animate", "creature"],
  eagle: ["animate", "creature"],
  snake: ["animate", "creature"],
  fish: ["animate", "creature", "food"],
  cow: ["animate", "creature"],
  deer: ["animate", "creature"],
  fox: ["animate", "creature"],
  // People (animate)
  mother: ["animate"],
  father: ["animate"],
  child: ["animate"],
  brother: ["animate"],
  sister: ["animate"],
  son: ["animate"],
  daughter: ["animate"],
  friend: ["animate"],
  king: ["animate"],
  queen: ["animate"],
  warrior: ["animate"],
  stranger: ["animate"],
  priest: ["animate"],
  elder: ["animate"],
  thief: ["animate"],
  farmer: ["animate"],
  hunter: ["animate"],
  shepherd: ["animate"],
  smith: ["animate"],
  trader: ["animate"],
  i: ["animate"],
  you: ["animate"],
  we: ["animate"],
  they: ["animate"],
  he: ["animate"],
  she: ["animate"],
  // Body parts
  hand: ["body-part", "inanimate"],
  foot: ["body-part", "inanimate"],
  eye: ["body-part", "inanimate"],
  ear: ["body-part", "inanimate"],
  head: ["body-part", "inanimate"],
  mouth: ["body-part", "inanimate"],
  heart: ["body-part", "inanimate"],
  // Tools
  knife: ["tool", "inanimate"],
  spear: ["tool", "inanimate"],
  rope: ["tool", "inanimate"],
  // Inanimate
  stone: ["inanimate"],
  tree: ["inanimate"],
  fire: ["inanimate"],
  moon: ["inanimate"],
  sun: ["inanimate"],
  river: ["inanimate", "place"],
  mountain: ["inanimate", "place"],
  sea: ["inanimate", "place"],
  sky: ["inanimate"],
  earth: ["inanimate", "place"],
  rain: ["inanimate"],
  snow: ["inanimate"],
  wind: ["inanimate"],
  // Places
  house: ["inanimate", "place"],
  road: ["inanimate", "place"],
  field: ["inanimate", "place"],
  boat: ["inanimate", "tool"],
  // Abstract
  truth: ["abstract"],
  name: ["abstract"],
  word: ["abstract"],
};

/**
 * Per-verb semantic frame: what semantic class(es) the verb's object
 * should belong to. The matcher prefers any meaning whose class set
 * intersects the verb's allowed classes.
 *
 * If a verb isn't in this map, the slot picker falls back to the
 * full pool — so partial coverage is fine.
 */
const VERB_FRAMES: Record<Meaning, ReadonlyArray<SemanticClass>> = {
  // Drink: liquids
  drink: ["liquid"],
  // Eat: food
  eat: ["food"],
  // See / hear / know: prefer animate or concrete
  see: ["animate", "inanimate", "creature"],
  hear: ["animate", "inanimate", "creature"],
  know: ["animate", "abstract"],
  // Take / hold / give: tools, food, inanimate, animate (gift)
  take: ["tool", "food", "inanimate", "animate"],
  hold: ["tool", "food", "inanimate", "animate", "body-part"],
  give: ["tool", "food", "inanimate"],
  make: ["tool", "food", "inanimate"],
  break: ["tool", "inanimate"],
  // Fight / kill / hunt: creatures or animate
  fight: ["animate", "creature"],
  kill: ["animate", "creature"],
  hunt: ["animate", "creature"],
  attack: ["animate", "creature"],
  // Speak / say / think: prefer abstract or animate addressee
  speak: ["abstract", "animate"],
  say: ["abstract"],
  think: ["abstract"],
};

/**
 * Filter the candidate meaning list to those whose semantic class
 * intersects the verb's frame. Returns the original list if no frame
 * is recorded for the verb, or if filtering would yield an empty
 * pool. The narrative composer calls this so verb-object pairs land
 * on plausible combinations — drink+liquid, eat+food, fight+creature.
 */
export function filterByFrame(
  verb: Meaning,
  candidates: ReadonlyArray<Meaning>,
): ReadonlyArray<Meaning> {
  const frame = VERB_FRAMES[verb];
  if (!frame || frame.length === 0) return candidates;
  const filtered = candidates.filter((m) => {
    const classes = MEANING_CLASSES[m];
    if (!classes) return false;
    for (const c of classes) {
      if (frame.includes(c)) return true;
    }
    return false;
  });
  // If the filter would leave an empty pool, fall back to the original
  // so the narrative still renders rather than failing silently.
  return filtered.length > 0 ? filtered : candidates;
}

/**
 * Returns the recorded semantic classes for a meaning, or empty if
 * unmapped. Used by tests + future narrative-introspection panels.
 */
export function classesOf(meaning: Meaning): ReadonlyArray<SemanticClass> {
  return MEANING_CLASSES[meaning] ?? [];
}
