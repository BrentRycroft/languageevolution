/**
 * Hand-curated semantic-neighbor table for the default Swadesh-ish lexicon.
 * Each meaning maps to a small set of plausible shifts. When a meaning drifts,
 * the current form is assigned to a neighbor meaning, and the original may
 * stay with a re-coined form or disappear (depending on rule).
 *
 * This is intentionally simple: zero runtime dependencies, baked into the
 * bundle, deterministic under the seeded RNG. A richer variant using
 * real embeddings or a tiny on-device LM is listed in the plan as future work.
 */
export const SEMANTIC_NEIGHBORS: Record<string, string[]> = {
  water: ["river", "drink", "rain"],
  fire: ["flame", "burn", "hot"],
  stone: ["rock", "hard", "mountain"],
  mother: ["woman", "parent", "aunt"],
  father: ["man", "parent", "uncle"],
  night: ["dark", "sleep", "moon"],
  tree: ["wood", "branch", "forest"],
  sun: ["day", "light", "star"],
  moon: ["night", "month", "light"],
  star: ["sky", "night", "sun"],
  two: ["pair", "couple", "three"],
  three: ["few", "two", "four"],
  hand: ["arm", "finger", "palm"],
  foot: ["leg", "toe", "step"],
  heart: ["chest", "courage", "love"],
  head: ["top", "chief", "skull"],
  eye: ["see", "vision", "hole"],
  ear: ["hear", "listen", "side"],
  mouth: ["speak", "lip", "opening"],
  tooth: ["bite", "edge", "point"],
  bone: ["hard", "body", "core"],
  blood: ["red", "life", "kin"],
  hair: ["fur", "thread", "fine"],
  dog: ["pet", "wolf", "hunt"],
  wolf: ["dog", "wild", "pack"],
  horse: ["ride", "beast", "pony"],
  cow: ["cattle", "milk", "beef"],
  fish: ["swim", "water", "meat"],
  bird: ["wing", "fly", "sky"],
  snake: ["worm", "slither", "creep"],
  go: ["leave", "walk", "travel"],
  come: ["arrive", "approach", "go"],
  see: ["look", "watch", "eye"],
  know: ["learn", "understand", "wise"],
  eat: ["food", "taste", "bite"],
  drink: ["water", "swallow", "sip"],
  sleep: ["dream", "rest", "night"],
  die: ["death", "end", "old"],
  one: ["alone", "first", "two"],
  big: ["great", "large", "old"],
  small: ["little", "young", "few"],
  new: ["young", "fresh", "start"],
  old: ["ancient", "worn", "big"],
  good: ["kind", "right", "great"],
  bad: ["evil", "wrong", "ill"],
};

export function neighborsOf(meaning: string): string[] {
  return SEMANTIC_NEIGHBORS[meaning] ?? [];
}
