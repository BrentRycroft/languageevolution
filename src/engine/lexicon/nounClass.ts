import type { Language, Meaning } from "../types";
import { fnv1a } from "../rng";
import { posOf } from "./pos";

/**
 * Phase 36 Tranche 36b: Bantu-style noun-class assignment.
 *
 * Each noun in the lexicon is assigned to one of 8 classes. The
 * assignment is deterministic: a per-language seed plus the meaning
 * hashes to a class, biased by a coarse semantic classifier (person
 * → 1/2; tree/plant → 3/4; abstract → 5/6; thing → 7/8).
 *
 * The simulator uses these assignments at realise.ts to inflect the
 * head noun with the matching class prefix and to drive verb-class
 * agreement. Languages without `nounClassAssignments` skip the
 * mechanism entirely.
 */

export type NounClass = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const PERSON_MEANINGS = new Set<string>([
  "person", "man", "woman", "child", "father", "mother", "brother",
  "sister", "friend", "stranger", "king", "queen", "warrior",
  "teacher", "singer", "runner", "parent", "wife", "husband",
  "son", "daughter", "uncle", "aunt", "elder",
]);

const TREE_PLANT_MEANINGS = new Set<string>([
  "tree", "plant", "leaf", "root", "branch", "flower", "grass",
  "seed", "fruit", "vine", "bush", "forest",
]);

const ABSTRACT_MEANINGS = new Set<string>([
  "love", "fear", "hope", "joy", "darkness", "happiness", "sadness",
  "goodness", "freedom", "kingdom", "friendship", "childhood",
  "knowledge", "wisdom", "truth", "lie", "peace", "war", "spirit",
]);

/**
 * Assigns a single noun-class slot to a meaning. Returns null if the
 * meaning is not a noun (open-class POS check), so adjectives and
 * verbs are skipped. Deterministic given lang.id + meaning.
 */
export function assignNounClass(
  meaning: Meaning,
  lang: Language,
): NounClass | null {
  const pos = posOf(meaning);
  if (pos !== "noun") return null;

  // Semantic classifier first.
  if (PERSON_MEANINGS.has(meaning)) {
    // Class 1 (sg) by default; class 2 is the plural counterpart and
    // is selected at realise time when number === "pl". Here we
    // assign the singular slot.
    return 1;
  }
  if (TREE_PLANT_MEANINGS.has(meaning)) return 3;
  if (ABSTRACT_MEANINGS.has(meaning)) return 5;

  // Fallback: deterministic hash bucket among 7/8 (artefact/object
  // classes), with occasional 5/6 (abstract / mass) bleed.
  const seed = fnv1a(`${lang.id}::nclass::${meaning}`);
  const r = seed % 100;
  if (r < 70) return 7;
  if (r < 90) return 5;
  return 3;
}

/**
 * Populate `lang.nounClassAssignments` for every noun in the lexicon.
 * Idempotent — safe to call at language birth and after lexicon
 * coinage.
 */
export function assignAllNounClasses(lang: Language): void {
  if (!lang.nounClassAssignments) lang.nounClassAssignments = {};
  for (const meaning of Object.keys(lang.lexicon)) {
    if (lang.nounClassAssignments[meaning] !== undefined) continue;
    const c = assignNounClass(meaning, lang);
    if (c !== null) lang.nounClassAssignments[meaning] = c;
  }
}

/**
 * Plural-class mapping. Bantu pairs singular and plural classes:
 * 1↔2 (people), 3↔4 (trees), 5↔6 (artefacts), 7↔8 (small things).
 */
export function pluralClassOf(c: NounClass): NounClass {
  switch (c) {
    case 1: return 2;
    case 3: return 4;
    case 5: return 6;
    case 7: return 8;
    // 2/4/6/8 are already plural — no change.
    default: return c;
  }
}
