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

/**
 * Expanded part-of-speech taxonomy. Open-class items (noun, verb,
 * adjective, adverb) participate in genesis + drift; closed-class items
 * (article, preposition, particle, …) are tagged so the translator can
 * route them through the language-specific closed-class lookup table
 * instead of the lexicon resolution chain that's tuned for open-class
 * meanings.
 *
 * Backwards-compatibility note: every prior caller that destructured
 * `"noun" | "verb" | "adjective" | "pronoun" | "numeral" | "other"`
 * still works — those tags remain. New tags supplement, they do not
 * displace.
 */
export type POS =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "pronoun"
  | "determiner"
  | "article"
  | "preposition"
  | "coord_conj"
  | "subord_conj"
  | "auxiliary"
  | "particle"
  | "interjection"
  | "numeral"
  | "complementiser"
  | "negator"
  | "classifier"
  | "other";

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

// ---------------------------------------------------------------------------
// Closed-class tags. These rarely surface as native concept ids in the seed
// lexicon (most languages don't have a native gloss for "the" or "in" — the
// translator emits language-specific closed-class tokens). They're enumerated
// here so the typology / translator layers can detect when a meaning is
// closed-class and route it through the language's closed-class table
// instead of the open-class lexicon resolver.
// ---------------------------------------------------------------------------

const ARTICLES: ReadonlySet<Meaning> = new Set([
  "the", "a", "an",
]);
const DETERMINERS: ReadonlySet<Meaning> = new Set([
  "this", "that", "these", "those", "some", "any", "all", "no", "every",
  "my", "your", "his", "her", "our", "their", "its",
]);
const PREPOSITIONS: ReadonlySet<Meaning> = new Set([
  "in", "on", "at", "to", "from", "by", "with", "for", "of",
  "under", "over", "through", "near", "after", "before", "across",
  "between", "around", "into", "onto", "out", "off",
]);
const COORD_CONJUNCTIONS: ReadonlySet<Meaning> = new Set([
  "and", "or", "but", "nor", "yet", "so",
]);
const SUBORD_CONJUNCTIONS: ReadonlySet<Meaning> = new Set([
  "because", "when", "while", "if", "unless", "although", "though",
  "since", "until", "as",
]);
const AUXILIARIES: ReadonlySet<Meaning> = new Set([
  "will", "would", "shall", "should", "can", "could", "may", "might",
  "must", "have", "has", "had", "be", "is", "are", "was", "were",
  "do", "does", "did",
]);
const PARTICLES: ReadonlySet<Meaning> = new Set([
  "already", "just", "even", "still", "yet", "indeed", "perhaps",
  "maybe",
]);
const INTERJECTIONS: ReadonlySet<Meaning> = new Set([
  "oh", "ah", "ouch", "alas", "yes", "no",
]);
const COMPLEMENTISERS: ReadonlySet<Meaning> = new Set([
  "that", "whether",
]);
const NEGATORS: ReadonlySet<Meaning> = new Set([
  "not", "n't", "never",
]);
const ADVERBS: ReadonlySet<Meaning> = new Set([
  "quickly", "slowly", "well", "badly", "now", "then", "soon", "later",
  "always", "often", "sometimes", "rarely", "very", "really", "quite",
  "almost", "nearly", "here-adv", "there-adv",
]);

export function posOf(meaning: Meaning): POS {
  // Closed-class probes first: short, specific, unambiguous matches.
  if (ARTICLES.has(meaning)) return "article";
  if (NEGATORS.has(meaning)) return "negator";
  if (AUXILIARIES.has(meaning)) return "auxiliary";
  if (COORD_CONJUNCTIONS.has(meaning)) return "coord_conj";
  if (SUBORD_CONJUNCTIONS.has(meaning)) return "subord_conj";
  if (COMPLEMENTISERS.has(meaning)) return "complementiser";
  if (DETERMINERS.has(meaning)) return "determiner";
  if (PREPOSITIONS.has(meaning)) return "preposition";
  if (PARTICLES.has(meaning)) return "particle";
  if (INTERJECTIONS.has(meaning)) return "interjection";
  if (ADVERBS.has(meaning)) return "adverb";
  // Open-class — original waterfall.
  if (NOUNS.has(meaning)) return "noun";
  if (VERBS.has(meaning)) return "verb";
  if (ADJECTIVES.has(meaning)) return "adjective";
  if (PRONOUNS.has(meaning)) return "pronoun";
  if (NUMERALS.has(meaning)) return "numeral";
  return "other";
}

/**
 * True when a POS is closed-class (small, fixed inventory; doesn't
 * grow via genesis). Used by the translator + drift to skip the
 * open-class resolution paths for these meanings.
 */
export function isClosedClass(pos: POS): boolean {
  switch (pos) {
    case "article":
    case "determiner":
    case "preposition":
    case "coord_conj":
    case "subord_conj":
    case "auxiliary":
    case "particle":
    case "complementiser":
    case "negator":
    case "classifier":
    case "interjection":
    case "pronoun":
      return true;
    default:
      return false;
  }
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
