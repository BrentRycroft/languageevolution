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
    form: [],
    point: toVec(m.point),
    type: m.type as Morpheme["type"],
  }));
  const wordPoints = new Map<string, Vec>(
    MORPHEME_SPACE.words.map((w) => [w.meaning, toVec(w.point)]),
  );
  return { morphemes, wordPoints };
}
