import type { Language } from "../types";
import { satGet, satSet } from "../lexicon/satellites";
import type { Rng } from "../rng";
import { deleteMeaning } from "../lexicon/mutate";
import { lexHas } from "../lexicon/access";

/**
 * bleaching.ts
 *
 * Semantic drift, recarving (split / merge), bleaching, colexification, neighbour relations. Key exports: BleachResult, stepSemanticBleaching.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const BLEACH_CADENCE = 6;
const DROP_THRESHOLD = 0.18;

export interface BleachResult {
  meaning: string;
  bleached: boolean;
  dropped: boolean;
  newFrequency: number;
}

export function stepSemanticBleaching(
  lang: Language,
  generation: number,
  rng: Rng,
): BleachResult | null {
  if (generation % BLEACH_CADENCE !== 0) return null;
  if (!rng.chance(0.25)) return null;

  const grammaticalizedSources: string[] = [];
  const morph = lang.morphology.paradigms;
  for (const cat of Object.keys(morph) as Array<keyof typeof morph>) {
    const p = morph[cat];
    if (!p?.source) continue;
    const m = p.source.meaning;
    if (lexHas(lang, m)) grammaticalizedSources.push(m);
  }
  if (grammaticalizedSources.length === 0) return null;

  const meaning = grammaticalizedSources[rng.int(grammaticalizedSources.length)]!;
  const cur = satGet(lang, "wordFrequencyHints", meaning) ?? 0.5;
  const next = Math.max(0.05, cur * 0.78);
  satSet(lang, "wordFrequencyHints", meaning, next);

  if (next < DROP_THRESHOLD && rng.chance(0.35)) {
    // Phase 72d-2 (defer-1a): record bleaching pathway. No mergedInto
    // because bleaching drops a meaning rather than merging it.
    deleteMeaning(lang, meaning, { generation, reason: "bleach" });
    return { meaning, bleached: true, dropped: true, newFrequency: 0 };
  }
  return { meaning, bleached: true, dropped: false, newFrequency: next };
}
