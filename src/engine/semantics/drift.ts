import type { Language } from "../types";
import type { Rng } from "../rng";
import { neighborsOf } from "./neighbors";

export interface SemanticDrift {
  from: string;
  to: string;
}

export type NeighborOverride = Record<string, string[]>;

/**
 * Attempt one semantic drift event on the language's lexicon.
 * Picks a meaning with semantic neighbors and reassigns its current form to
 * a neighbor meaning. The old meaning is removed (the word "shifted").
 * Returns null if no applicable meaning was found.
 *
 * If `override` is provided (e.g. an LLM-populated neighbor map), it is
 * consulted before the built-in static table.
 */
export function driftOneMeaning(
  lang: Language,
  rng: Rng,
  override?: NeighborOverride,
): SemanticDrift | null {
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length === 0) return null;
  const shuffled: string[] = [];
  const used = new Set<number>();
  while (shuffled.length < meanings.length) {
    const idx = rng.int(meanings.length);
    if (used.has(idx)) continue;
    used.add(idx);
    shuffled.push(meanings[idx]!);
  }
  for (const m of shuffled) {
    const overrideNeighbors = override?.[m];
    const neighbors =
      overrideNeighbors && overrideNeighbors.length > 0
        ? overrideNeighbors
        : neighborsOf(m);
    if (neighbors.length === 0) continue;
    const target = neighbors[rng.int(neighbors.length)]!;
    if (lang.lexicon[target]) continue;
    const form = lang.lexicon[m]!;
    lang.lexicon[target] = form;
    delete lang.lexicon[m];
    return { from: m, to: target };
  }
  return null;
}
