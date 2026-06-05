/**
 * morphemeSpaceLoader.ts — read the baked morpheme space into typed runtime structures.
 * Plan 3 (storage flip) seeds lexeme/morpheme points from here.
 */
import type { Vec } from "./vec";
import type { Morpheme } from "./morphemeSpace";
import { MORPHEME_SPACE } from "./morphemeSpaceData";

function toVec(arr: readonly number[]): Vec {
  return Int32Array.from(arr);
}

export interface LoadedMorphemeSpace {
  morphemes: Morpheme[];
  wordPoints: Map<string, Vec>;
}

export function loadMorphemeSpace(): LoadedMorphemeSpace {
  const morphemes: Morpheme[] = MORPHEME_SPACE.morphemes.map((m) => ({
    id: m.id,
    form: [], // no phonological form baked in Plan 2 — Plan 3 wires forms from the lexicon.
    point: toVec(m.point),
    type: m.type as Morpheme["type"],
  }));
  const wordPoints = new Map<string, Vec>(
    MORPHEME_SPACE.words.map((w) => [w.meaning, toVec(w.point)]),
  );
  return { morphemes, wordPoints };
}

let WORD_PARTS: Map<string, readonly string[]> | null = null;

/**
 * The ordered morpheme part-ids for a decomposed word, or null if it has no recorded
 * decomposition. e.g. "behind" → ["hind", "be-"], "daylight" → ["day", "light"], "water" → null.
 * Lazily indexes the baked words once. Used by the Dictionary to show a word's composition.
 */
export function morphemeBreakdown(meaning: string): readonly string[] | null {
  if (WORD_PARTS === null) {
    WORD_PARTS = new Map(MORPHEME_SPACE.words.map((w) => [w.meaning, w.parts]));
  }
  return WORD_PARTS.get(meaning) ?? null;
}
