import type { Meaning } from "../types";

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
  "body", "head", "face", "eye", "ear", "nose", "mouth", "tongue",
  "tooth", "lip", "chin", "neck", "shoulder", "arm", "hand", "finger",
  "nail", "chest", "breast", "back", "belly", "heart", "liver", "lung",
  "bone", "blood", "skin", "flesh", "knee", "leg", "foot", "hair", "horn",
  "feather", "wing", "egg", "claw", "tail",
  "person", "man", "woman", "child", "baby", "mother", "father", "son",
  "daughter", "brother", "sister", "husband", "wife", "king", "god",
  "guest", "enemy", "he", "she", "name",
  "dog", "wolf", "horse", "cow", "bull", "sheep", "goat", "pig", "bear",
  "deer", "fish", "bird", "eagle", "snake", "worm", "louse", "bee",
  "cat", "chicken", "rabbit",
  "tree", "wood", "leaf", "flower", "grass", "root", "seed", "fruit",
  "grain", "bark", "oak", "birch", "apple",
  "water", "fire", "stone", "earth", "sky", "sun", "moon", "star",
  "cloud", "rain", "snow", "ice", "wind", "thunder", "lightning",
  "river", "sea", "lake", "mountain", "hill", "valley", "forest", "field",
  "road", "path",
  "day", "night", "morning", "evening", "year", "season", "winter",
  "summer", "time",
  "house", "door", "fire2", "hearth", "yoke", "wheel", "axle", "boat",
  "ship", "knife", "axe", "spear", "bow", "arrow", "rope", "cloth", "wool",
  "bread", "meat", "milk", "honey", "salt", "wine", "oil",
  "word", "truth", "dream",
]);

const VERBS: ReadonlySet<Meaning> = new Set([
  "be", "go", "come", "walk", "run", "stand", "sit", "lie", "fall",
  "fly", "swim",
  "see", "hear", "know", "think", "speak", "say", "call", "ask",
  "do", "make", "take", "give", "hold", "carry", "throw", "pull",
  "push", "cut", "break", "bend", "build", "burn", "wash", "weave",
  "plant", "sow", "freeze", "melt", "hunt", "fight", "scratch",
  "dig", "split", "sew", "rub", "wipe", "pour", "flow", "suck",
  "blow", "spit", "vomit", "bite", "kill", "breathe",
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
  if (NOUNS.has(meaning)) return "noun";
  if (VERBS.has(meaning)) return "verb";
  if (ADJECTIVES.has(meaning)) return "adjective";
  if (PRONOUNS.has(meaning)) return "pronoun";
  if (NUMERALS.has(meaning)) return "numeral";
  return "other";
}

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

export function samePOS(a: Meaning, b: Meaning): boolean {
  const pa = posOf(a);
  const pb = posOf(b);
  if (pa === "other" || pb === "other") return true;
  return pa === pb;
}
