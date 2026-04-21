import type { Phoneme } from "../types";
import { isVowel } from "./ipa";

export const HIGH = "˥";
export const MID = "˧";
export const LOW = "˩";
export const RISING = "˧˥";
export const FALLING = "˥˩";
export const TONE_MARKS: ReadonlyArray<string> = [HIGH, MID, LOW, RISING, FALLING];

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
