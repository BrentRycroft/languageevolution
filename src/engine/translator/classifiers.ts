import type { Meaning } from "../types";

/**
 * classifiers.ts
 *
 * English → target sentence (parse / realise / sentence) and target → English caption (glossToEnglish, cognates, reverse). Key exports: DEFAULT_CLASSIFIER_TABLE, classifierKeyFor, classifierMeaningFor.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const DEFAULT_CLASSIFIER_TABLE: Record<string, string> = {
  human: "person",
  animal: "creature",
  long_thin: "stick",
  flat: "leaf",
  round: "round-thing",
  collective: "group",
  liquid: "drop",
  vehicle: "vehicle",
  default: "thing",
};

const HUMANS = new Set([
  "mother", "father", "son", "daughter", "brother", "sister",
  "uncle", "aunt", "grandparent", "grandfather", "grandmother",
  "child", "parent", "husband", "wife", "friend", "cousin",
  "nephew", "niece", "neighbor", "stranger", "elder", "ancestor",
  "warrior", "king", "servant", "tribe", "clan", "family",
  "i", "you", "we", "they", "he", "she", "he-she",
]);

const ANIMALS = new Set([
  "dog", "wolf", "horse", "cow", "fish", "bird", "snake", "cat",
  "bear", "deer", "rabbit", "mouse", "fox", "boar", "ox", "sheep",
  "goat", "chicken", "duck", "eagle", "hawk", "pig", "lion", "tiger",
  "frog", "lizard", "bee", "ant", "spider", "worm", "fly",
]);

const LONG_THIN = new Set([
  "spear", "sword", "stick", "rope", "needle", "branch", "vine",
  "thread", "arrow", "bow", "tongue", "tail", "hair", "snake",
]);

const FLAT = new Set([
  "leaf", "cloth", "shirt", "robe", "blanket", "page", "shore",
  "field", "plate", "shadow", "wing",
]);

const ROUND = new Set([
  "stone", "fruit", "berry", "egg", "moon", "sun", "head", "eye",
  "bowl", "cup", "ring", "wheel",
]);

const LIQUIDS = new Set([
  "water", "milk", "blood", "wine", "beer", "broth", "oil", "soup",
  "rain", "river", "stream", "sea", "lake",
]);

const VEHICLES = new Set([
  "boat", "ship", "cart", "wagon",
]);

export function classifierKeyFor(meaning: Meaning): string {
  if (HUMANS.has(meaning)) return "human";
  if (ANIMALS.has(meaning)) return "animal";
  if (LONG_THIN.has(meaning)) return "long_thin";
  if (FLAT.has(meaning)) return "flat";
  if (ROUND.has(meaning)) return "round";
  if (LIQUIDS.has(meaning)) return "liquid";
  if (VEHICLES.has(meaning)) return "vehicle";
  return "default";
}

export function classifierMeaningFor(
  meaning: Meaning,
  table?: Record<string, string | import("../types").Phoneme[]>,
): string {
  const key = classifierKeyFor(meaning);
  const t = table ?? DEFAULT_CLASSIFIER_TABLE;
  const entry = t[key] ?? t.default;
  if (typeof entry === "string") return entry;
  // Phase 64 T3: when the table holds direct phoneme forms, fall
  // through to the default-table meaning string so callers that look
  // up the lexicon by meaning still find a hit. The realiser
  // (realise.ts:444) reads the form via lang.grammar.classifierTable
  // directly when it's a Phoneme[].
  return DEFAULT_CLASSIFIER_TABLE[key] ?? "thing";
}

/**
 * Phase 64 T3: read the classifier form directly when the table
 * holds a Phoneme[] entry. Returns null when the table holds a
 * string (caller should look up `lang.lexicon[meaning]`).
 */
export function classifierFormFor(
  meaning: Meaning,
  table?: Record<string, string | import("../types").Phoneme[]>,
): import("../types").Phoneme[] | null {
  if (!table) return null;
  const key = classifierKeyFor(meaning);
  const entry = table[key] ?? table.default;
  if (Array.isArray(entry)) return entry.slice();
  return null;
}
