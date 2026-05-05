import type { Language, LanguageTree } from "../types";
import { levenshtein } from "../phonology/ipa";

/**
 * Phase 35 Tranche 35a: lexicostatistic + glottochronological
 * primitives.
 *
 * Lexicostatistics: pairwise cognate retention between language
 * pairs. For each meaning in a fixed Swadesh-style set, two
 * languages are "cognate" if their forms are phonologically close
 * (Levenshtein distance ≤ 2 or similarity ≥ 0.6). Retention rate is
 * the % of meanings cognate.
 *
 * Glottochronology: per-language Swadesh retention rate vs the
 * proto-language at gen 0. Classical Swadesh prediction: ~80% per
 * 1000 years (which translates to ~80% per 30-50 generations
 * depending on yearsPerGeneration). The simulator's actual decay
 * rate is observable here.
 */

const SWADESH_100 = [
  "i", "you", "we", "this", "that",
  "who", "what", "not", "all", "many",
  "one", "two", "big", "long", "small",
  "woman", "man", "person", "fish", "bird",
  "dog", "louse", "tree", "seed", "leaf",
  "root", "bark", "skin", "flesh", "blood",
  "bone", "fat", "egg", "horn", "tail",
  "feather", "hair", "head", "ear", "eye",
  "nose", "mouth", "tooth", "tongue", "claw",
  "foot", "knee", "hand", "belly", "neck",
  "breast", "heart", "liver", "drink", "eat",
  "bite", "see", "hear", "know", "sleep",
  "die", "kill", "swim", "fly", "walk",
  "come", "lie", "sit", "stand", "give",
  "say", "sun", "moon", "star", "water",
  "rain", "stone", "sand", "earth", "cloud",
  "smoke", "fire", "ash", "burn", "path",
  "mountain", "red", "green", "yellow", "white",
  "black", "night", "hot", "cold", "full",
  "new", "good", "round", "dry", "name",
];

export const SWADESH_LIST: ReadonlyArray<string> = SWADESH_100;

/**
 * Compute the share of Swadesh items where two languages have
 * cognate (phonologically-close) forms.
 *
 * Threshold: forms are cognate if their Levenshtein distance is
 * ≤ max(2, ceil(min-length × 0.4)). This catches obvious cognates
 * (English head / German Haupt are cognate but Levenshtein 4 over
 * length 5 is ~80% similar; tunable but a reasonable default).
 */
export function pairwiseRetention(a: Language, b: Language): {
  attested: number;
  cognate: number;
  retention: number;
} {
  let attested = 0;
  let cognate = 0;
  for (const m of SWADESH_100) {
    const fa = a.lexicon[m];
    const fb = b.lexicon[m];
    if (!fa || !fb || fa.length === 0 || fb.length === 0) continue;
    attested++;
    const d = levenshtein(fa, fb);
    const minLen = Math.min(fa.length, fb.length);
    const threshold = Math.max(2, Math.ceil(minLen * 0.4));
    if (d <= threshold) cognate++;
  }
  return {
    attested,
    cognate,
    retention: attested === 0 ? 0 : cognate / attested,
  };
}

/**
 * Build a heatmap matrix of pairwise retentions across all alive
 * leaves. Diagonal is 1.0 (a language is fully cognate with itself).
 * Symmetric.
 */
export function retentionMatrix(tree: LanguageTree, leafIds: readonly string[]): {
  ids: string[];
  matrix: number[][];
  attested: number[][];
} {
  const ids = leafIds.slice();
  const matrix: number[][] = ids.map(() => ids.map(() => 0));
  const attested: number[][] = ids.map(() => ids.map(() => 0));
  for (let i = 0; i < ids.length; i++) {
    matrix[i]![i] = 1.0;
    attested[i]![i] = SWADESH_100.length;
    for (let j = i + 1; j < ids.length; j++) {
      const a = tree[ids[i]!]!.language;
      const b = tree[ids[j]!]!.language;
      const r = pairwiseRetention(a, b);
      matrix[i]![j] = r.retention;
      matrix[j]![i] = r.retention;
      attested[i]![j] = r.attested;
      attested[j]![i] = r.attested;
    }
  }
  return { ids, matrix, attested };
}

/**
 * Compute a language's Swadesh retention against a seed lexicon.
 * Used for glottochronology: how much of the proto's Swadesh core
 * does the daughter still share?
 */
export function swadeshRetentionVsSeed(
  lang: Language,
  seedLexicon: import("../types").Lexicon,
): { attested: number; retained: number; retention: number } {
  let attested = 0;
  let retained = 0;
  for (const m of SWADESH_100) {
    const seed = seedLexicon[m];
    const cur = lang.lexicon[m];
    if (!seed || seed.length === 0 || !cur || cur.length === 0) continue;
    attested++;
    const d = levenshtein(seed, cur);
    const minLen = Math.min(seed.length, cur.length);
    const threshold = Math.max(2, Math.ceil(minLen * 0.4));
    if (d <= threshold) retained++;
  }
  return {
    attested,
    retained,
    retention: attested === 0 ? 0 : retained / attested,
  };
}
