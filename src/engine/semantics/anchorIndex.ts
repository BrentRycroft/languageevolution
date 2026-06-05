/**
 * anchorIndex.ts — the point-native "what currently means concept X" lookup (vector-native flip,
 * Wave 1b).
 *
 * The concept-keyed engine answers "the word for water" by a stored-key lookup
 * (`findPrimaryWordForMeaning(lang, "water")`). The vector-native model answers it by GEOMETRY: a
 * sense's identity is its point, its gloss is the nearest anchor (`senseGloss`), so the words that
 * "mean water" are the senses whose emergent gloss is `water`. This module indexes a language's
 * senses by that emergent gloss — the anchor → lexeme index the plan calls for.
 *
 * It is a DERIVED read-side view (rebuilt from `lang.words` on demand), draws no RNG, and is not yet
 * wired into the determinism-sensitive paths — Wave 2 swaps the semantic consumers onto it. Filing
 * uses `effectiveGloss` (hybrid): real-anchor words file under their emergent gloss (==authored 99.6%
 * at seed), orphan/hash-point words under their authored key — so `findWordByEmergentGloss` is a
 * faithful drop-in for `findPrimaryWordForMeaning`; the golden test proves the parity.
 *
 * Determinism: iterates `lang.words` in array order; within an anchor bucket, senses keep that
 * order (primary-sense words therefore precede later coinages deterministically).
 */
import type { Language, Meaning, Word, WordSense } from "../types";
import { effectiveGloss } from "./meaningPoint";

/** A sense placed at its emergent anchor: the (word, sense) pair plus the anchor concept it glosses to. */
export interface AnchoredSense {
  word: Word;
  sense: WordSense;
  /** Emergent gloss: the concept of the anchor nearest the sense's point. */
  gloss: Meaning;
}

/**
 * Group every sense of `lang.words` by its EMERGENT gloss (nearest anchor of the sense's point).
 * The point-native inverse of the stored gloss→form map: identity is geometric, not the stored key.
 */
export function anchorIndexOf(lang: Language): Map<Meaning, AnchoredSense[]> {
  const out = new Map<Meaning, AnchoredSense[]>();
  if (!lang.words) return out;
  for (const word of lang.words) {
    for (const sense of word.senses) {
      const gloss = effectiveGloss(sense);
      let bucket = out.get(gloss);
      if (!bucket) {
        bucket = [];
        out.set(gloss, bucket);
      }
      bucket.push({ word, sense, gloss });
    }
  }
  return out;
}

/** A word's effective gloss: emergent (nearest anchor) where its point is real, else its authored key. */
export function glossOfWord(word: Word): Meaning {
  const sense = word.senses[word.primarySenseIndex] ?? word.senses[0]!;
  return effectiveGloss(sense);
}

/**
 * The primary (non-synonym) word that currently means `concept` BY GEOMETRY — the word whose
 * primary sense's emergent gloss is `concept`. The vector-native parallel of
 * `findPrimaryWordForMeaning`; at seed time the two agree (golden-tested).
 */
export function findWordByEmergentGloss(lang: Language, concept: Meaning): Word | undefined {
  if (!lang.words) return undefined;
  return lang.words.find((w) => {
    const sense = w.senses[w.primarySenseIndex];
    return sense !== undefined && !sense.synonym && effectiveGloss(sense) === concept;
  });
}
