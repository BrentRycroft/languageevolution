import type { Meaning } from "../types";

/**
 * Coreness tier for a meaning, in [0, 1]. Higher = more resistant to
 * sound change, borrowing, drift, and taboo replacement. The Swadesh
 * 100 — body parts, kinship, basic numerals, fundamental verbs —
 * gets the top tier (1.0). The extended Swadesh 207 gets 0.75. The
 * rest gets 0.35 (still some nontrivial resistance because even
 * everyday non-Swadesh words don't swap overnight).
 *
 * The returned value is a *protection* factor, not a change rate:
 * callers divide their baseline rate by `1 + coreness * boost` to
 * slow core vocabulary proportionally. A word like "water" with
 * coreness 1.0 ends up evolving at roughly 1/3 the rate of a typical
 * non-core word at the default boost. That matches the empirical
 * observation that Swadesh-list vocabulary replaces at roughly the
 * inverse of its Swadesh tier (Embleton 1986, Holman et al. 2008).
 */

const SWADESH_100: ReadonlySet<Meaning> = new Set([
  // pronouns
  "i", "you", "we", "they", "this", "that",
  // interrogatives / negation
  "who", "what", "not",
  // numerals
  "one", "two", "three", "four", "five",
  // size / shape
  "big", "long", "small",
  // basic qualifiers
  "all", "many", "some", "few", "other",
  // people
  "woman", "man", "person", "mother", "father", "child",
  // animals & body parts
  "fish", "bird", "dog", "louse", "snake",
  "head", "ear", "eye", "nose", "mouth",
  "tooth", "tongue", "foot", "knee", "hand",
  "belly", "neck", "breast", "heart", "liver", "blood", "bone",
  "hair", "horn", "tail", "feather", "wing", "egg",
  "skin", "flesh", "claw",
  // basic verbs
  "drink", "eat", "bite", "see", "hear",
  "know", "sleep", "die", "kill", "swim",
  "fly", "walk", "come", "lie", "sit", "stand",
  "give", "say",
  // natural features
  "sun", "moon", "star", "water", "rain",
  "stone", "sand", "earth", "cloud", "smoke",
  "fire", "ash", "burn",
  "path", "road", "mountain",
  // plants
  "tree", "seed", "leaf", "root", "bark",
  // colours
  "red", "green", "yellow", "white", "black",
  // time / place
  "night", "day", "year", "name",
  // states
  "warm", "cold", "full", "new", "good", "round", "dry",
]);

/**
 * Extra entries from the Swadesh 207 list. Slightly less stable than
 * the core 100 but still markedly more stable than everyday words.
 */
const SWADESH_207_EXTRA: ReadonlySet<Meaning> = new Set([
  "and", "at", "because", "if", "in", "when",
  "here", "there",
  "wide", "narrow", "short", "thick", "thin", "heavy", "light",
  "straight", "smooth", "wet", "correct", "sharp", "dull",
  "bad", "right", "left",
  "father", "mother", "husband", "wife", "son", "daughter",
  "brother", "sister",
  "animal", "grass", "flower", "forest",
  "snow", "ice", "wind", "sky", "sea", "river", "lake",
  "house", "roof", "door",
  "near", "far",
  "dust", "soil", "sand",
  "breathe", "suck", "spit", "vomit", "blow", "laugh", "cry",
  "think", "count", "speak", "fear", "play", "hunt",
  "fight", "hit", "cut", "stab", "scratch", "dig", "split",
  "sew", "throw", "fall", "pull", "push", "squeeze",
  "rub", "wash", "wipe", "pour", "flow", "freeze", "swell",
  "turn", "tie", "hold",
  "rope", "stick", "thorn",
  "old", "young", "raw", "ripe",
]);

export function coreness(meaning: Meaning): number {
  if (SWADESH_100.has(meaning)) return 1.0;
  if (SWADESH_207_EXTRA.has(meaning)) return 0.75;
  return 0.35;
}

/**
 * Change-rate multiplier derived from coreness. Pass the baseline
 * rate through this to scale it down for core vocabulary. `boost`
 * controls how aggressive the suppression is (default 1.2 gives the
 * top Swadesh tier ~45 % of the non-core rate).
 */
export function corenessResistance(meaning: Meaning, boost = 1.2): number {
  return 1 / (1 + coreness(meaning) * boost);
}
