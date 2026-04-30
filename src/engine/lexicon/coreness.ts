import type { Meaning } from "../types";

const SWADESH_100: ReadonlySet<Meaning> = new Set([
  "i", "you", "we", "they", "this", "that",
  "who", "what", "not",
  "one", "two", "three", "four", "five",
  "big", "long", "small",
  "all", "many", "some", "few", "other",
  "woman", "man", "person", "mother", "father", "child",
  "fish", "bird", "dog", "louse", "snake",
  "head", "ear", "eye", "nose", "mouth",
  "tooth", "tongue", "foot", "knee", "hand",
  "belly", "neck", "breast", "heart", "liver", "blood", "bone",
  "hair", "horn", "tail", "feather", "wing", "egg",
  "skin", "flesh", "claw",
  "drink", "eat", "bite", "see", "hear",
  "know", "sleep", "die", "kill", "swim",
  "fly", "walk", "come", "lie", "sit", "stand",
  "give", "say",
  "sun", "moon", "star", "water", "rain",
  "stone", "sand", "earth", "cloud", "smoke",
  "fire", "ash", "burn",
  "path", "road", "mountain",
  "tree", "seed", "leaf", "root", "bark",
  "red", "green", "yellow", "white", "black",
  "night", "day", "year", "name",
  "warm", "cold", "full", "new", "good", "round", "dry",
]);

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

export function corenessResistance(meaning: Meaning, boost = 1.2): number {
  return 1 / (1 + coreness(meaning) * boost);
}
