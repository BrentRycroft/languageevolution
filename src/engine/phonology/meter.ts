import type { WordForm } from "../types";
import { stressClass, type StressPattern } from "./stress";
import { vowelIndices } from "./stress";

/**
 * Phase 26d: meter primitives — stress patterns + line scoring.
 *
 * Each syllable is labeled "S" (stressed) or "u" (unstressed). A word's
 * stress pattern is the sequence of these for each of its syllables
 * (vowels + syllabic consonants). Examples (English, penult stress):
 *   cat        →  "S"          (1 syllable, stressed)
 *   water      →  "Su"         (2 syllables, trochee)
 *   computer   →  "uSu"        (3 syllables, amphibrach)
 *
 * A line of poetry is a sequence of word stress patterns concatenated.
 * For "the QUICK BROWN fox JUMPED": "uSSuSS" (loosely scanned).
 *
 * Target meters:
 *   iambic  = "uS" repeated (rising 2-syllable foot)
 *   trochaic = "Su" repeated (falling 2-syllable foot)
 *   anapestic = "uuS" repeated
 *   dactylic  = "Suu" repeated
 */
export type StressSyllable = "S" | "u";

export function syllableStresses(
  form: WordForm,
  pattern: StressPattern = "penult",
  lexicalIdx?: number,
): StressSyllable[] {
  const out: StressSyllable[] = [];
  for (const i of vowelIndices(form)) {
    const cls = stressClass(form, i, pattern, lexicalIdx);
    out.push(cls === "stressed" ? "S" : "u");
  }
  return out;
}

/**
 * Aggregate the stress patterns of a sequence of word forms into one
 * line-level pattern.
 */
export function lineMeterPattern(
  words: WordForm[],
  pattern: StressPattern = "penult",
): string {
  return words.map((w) => syllableStresses(w, pattern).join("")).join("");
}

/**
 * Score a stress pattern against a target meter. Returns a score in
 * [0, 1] where 1 = exact match. Compares position-by-position; mismatches
 * dock the score by 1/length per position. The target meter is repeated
 * to match the line's length.
 */
export function meterScore(linePattern: string, targetUnit: string): number {
  if (linePattern.length === 0 || targetUnit.length === 0) return 0;
  const targetExpanded = targetUnit
    .repeat(Math.ceil(linePattern.length / targetUnit.length))
    .slice(0, linePattern.length);
  let matches = 0;
  for (let i = 0; i < linePattern.length; i++) {
    if (linePattern[i] === targetExpanded[i]) matches++;
  }
  return matches / linePattern.length;
}

/**
 * Standard meter targets (the recurring foot pattern).
 */
export const METER_TARGETS = {
  iambic: "uS",
  trochaic: "Su",
  anapestic: "uuS",
  dactylic: "Suu",
} as const;

export type MeterName = keyof typeof METER_TARGETS;
