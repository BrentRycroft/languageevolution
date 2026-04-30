import type { Language, Meaning } from "../types";

const MIN = 0.05;
const MAX = 0.95;
const DEFAULT = 0.5;

const DEFAULT_DECAY = 0.998;

export function bumpFrequency(lang: Language, meaning: Meaning, delta: number): void {
  const cur = lang.wordFrequencyHints[meaning] ?? DEFAULT;
  const next = Math.max(MIN, Math.min(MAX, cur + delta));
  lang.wordFrequencyHints[meaning] = next;
}

export function decayFrequencies(lang: Language, factor: number = DEFAULT_DECAY): void {
  for (const m of Object.keys(lang.wordFrequencyHints)) {
    const cur = lang.wordFrequencyHints[m]!;
    const next = Math.max(MIN, cur * factor);
    lang.wordFrequencyHints[m] = next;
  }
}
