import type { Meaning } from "../types";

/**
 * Part-of-speech classification for meanings. The engine stores
 * meanings as opaque English glosses (`water`, `eat`, `big`); this
 * module tags each one so downstream machinery — semantic drift,
 * narrative generation, genesis, grammaticalization — can respect
 * the verb/noun/adjective boundary instead of treating every word
 * interchangeably.
 *
 * Classification is deliberately static. Real languages do shift
 * words between POS ("text" as a verb, "iron" as an adjective), but
 * at the simulation's scope (meaning → form) the POS of a meaning is
 * a property of the meaning itself.
 */

export type POS = "noun" | "verb" | "adjective" | "pronoun" | "numeral" | "other";

const NOUNS: ReadonlySet<Meaning> = new Set([
  // body
  "body", "head", "face", "eye", "ear", "nose", "mouth", "tongue",
  "tooth", "lip", "chin", "neck", "shoulder", "arm", "hand", "finger",
  "nail", "chest", "breast", "back", "belly", "heart", "liver", "lung",
  "bone", "blood", "skin", "flesh", "knee", "leg", "foot", "hair", "horn",
  "feather", "wing", "egg", "claw", "tail",
  // kinship
  "person", "man", "woman", "child", "baby", "mother", "father", "son",
  "daughter", "brother", "sister", "husband", "wife", "king", "god",
  "guest", "enemy", "he", "she", "name",
  // animals & plants
  "dog", "wolf", "horse", "cow", "bull", "sheep", "goat", "pig", "bear",
  "deer", "fish", "bird", "eagle", "snake", "worm", "louse", "bee",
  "cat", "chicken", "rabbit",
  "tree", "wood", "leaf", "flower", "grass", "root", "seed", "fruit",
  "grain", "bark", "oak", "birch", "apple",
  // natural features
  "water", "fire", "stone", "earth", "sky", "sun", "moon", "star",
  "cloud", "rain", "snow", "ice", "wind", "thunder", "lightning",
  "river", "sea", "lake", "mountain", "hill", "valley", "forest", "field",
  "road", "path",
  // time
  "day", "night", "morning", "evening", "year", "season", "winter",
  "summer", "time",
  // household / artifact
  "house", "door", "fire2", "hearth", "yoke", "wheel", "axle", "boat",
  "ship", "knife", "axe", "spear", "bow", "arrow", "rope", "cloth", "wool",
  // food / drink
  "bread", "meat", "milk", "honey", "salt", "wine", "oil",
  // abstract / grammatical
  "word", "truth", "dream",
]);

const VERBS: ReadonlySet<Meaning> = new Set([
  // motion / state
  "be", "go", "come", "walk", "run", "stand", "sit", "lie", "fall",
  "fly", "swim",
  // perception / cognition
  "see", "hear", "know", "think", "speak", "say", "call", "ask",
  // action
  "do", "make", "take", "give", "hold", "carry", "throw", "pull",
  "push", "cut", "break", "bend", "build", "burn", "wash", "weave",
  "plant", "sow", "freeze", "melt", "hunt", "fight", "scratch",
  "dig", "split", "sew", "rub", "wipe", "pour", "flow", "suck",
  "blow", "spit", "vomit", "bite", "kill", "breathe",
  // life
  "eat", "drink", "sleep", "live", "die", "bear_child", "grow",
  "love", "fear", "laugh", "cry", "play",
]);

const ADJECTIVES: ReadonlySet<Meaning> = new Set([
  "big", "small", "long", "short", "tall", "wide", "narrow",
  "thick", "thin", "heavy", "light",
  "hot", "cold", "wet", "dry", "full", "empty",
  "new", "old", "young",
  "good", "bad", "sweet", "bitter", "strong", "weak",
  "fast", "slow", "smooth", "rough", "sharp", "dull",
  "round", "straight", "correct", "ripe", "raw",
  // colours
  "red", "black", "white", "green", "yellow", "blue",
]);

const PRONOUNS: ReadonlySet<Meaning> = new Set([
  "i", "you", "we", "they", "he", "she", "it",
  "this", "that", "here", "there",
  "who", "what",
]);

const NUMERALS: ReadonlySet<Meaning> = new Set([
  "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten", "hundred",
]);

export function posOf(meaning: Meaning): POS {
  if (NOUNS.has(meaning)) return "noun";
  if (VERBS.has(meaning)) return "verb";
  if (ADJECTIVES.has(meaning)) return "adjective";
  if (PRONOUNS.has(meaning)) return "pronoun";
  if (NUMERALS.has(meaning)) return "numeral";
  return "other";
}

/**
 * True when two meanings share a part-of-speech — used by
 * semantic drift to block noun → verb slippage.
 */
export function samePOS(a: Meaning, b: Meaning): boolean {
  const pa = posOf(a);
  const pb = posOf(b);
  if (pa === "other" || pb === "other") return true; // unknown — be permissive
  return pa === pb;
}
