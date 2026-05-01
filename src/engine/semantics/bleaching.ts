import type { Language } from "../types";
import type { Rng } from "../rng";

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
    if (lang.lexicon[m]) grammaticalizedSources.push(m);
  }
  if (grammaticalizedSources.length === 0) return null;

  const meaning = grammaticalizedSources[rng.int(grammaticalizedSources.length)]!;
  const cur = lang.wordFrequencyHints[meaning] ?? 0.5;
  const next = Math.max(0.05, cur * 0.78);
  lang.wordFrequencyHints[meaning] = next;

  if (next < DROP_THRESHOLD && rng.chance(0.35)) {
    delete lang.lexicon[meaning];
    delete lang.wordFrequencyHints[meaning];
    delete lang.wordOrigin[meaning];
    delete lang.lastChangeGeneration[meaning];
    if (lang.registerOf) delete lang.registerOf[meaning];
    if (lang.variants) delete lang.variants[meaning];
    return { meaning, bleached: true, dropped: true, newFrequency: 0 };
  }
  return { meaning, bleached: true, dropped: false, newFrequency: next };
}
