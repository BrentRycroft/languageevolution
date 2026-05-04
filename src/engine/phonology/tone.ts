import type { Phoneme } from "../types";
import { isVowel } from "./ipa";

export const HIGH = "˥";
export const MID = "˧";
export const LOW = "˩";
export const RISING = "˧˥";
export const FALLING = "˥˩";
// Phase 29 Tranche 5g: order longest-first so endsWith-based matchers
// (toneOf) prefer multi-char contour tones over their single-char
// suffixes — e.g. "i˧˥" should match RISING, not HIGH.
export const TONE_MARKS: ReadonlyArray<string> = [RISING, FALLING, HIGH, MID, LOW];

export function stripTone(p: Phoneme): Phoneme {
  let out = p;
  for (const m of TONE_MARKS) {
    if (out.endsWith(m)) out = out.slice(0, -m.length);
  }
  return out;
}

export function toneOf(p: Phoneme): string | null {
  for (const m of TONE_MARKS) if (p.endsWith(m)) return m;
  return null;
}

export function isToneBearing(p: Phoneme): boolean {
  return isVowel(stripTone(p));
}
