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

/**
 * Phase 30 Tranche 30a: strip ALL trailing tone marks recursively. Pre-
 * Phase-30 this stripped only one tone, so a stacked-tone segment like
 * `e˥˧˥˧˥` returned `e˥˧˥˧` (only RISING removed) and the inventory
 * sweep then counted the partially-stripped form as a "phoneme."
 * Recursive stripping makes the inventory faithful to the segment's
 * actual phonemic identity.
 */
export function stripTone(p: Phoneme): Phoneme {
  let out = p;
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of TONE_MARKS) {
      if (out.endsWith(m)) {
        out = out.slice(0, -m.length);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * Returns the rightmost tone mark on a phoneme, or null. (Same shape
 * as before Phase 30 — only `stripTone` got the recursive upgrade.)
 */
export function toneOf(p: Phoneme): string | null {
  for (const m of TONE_MARKS) if (p.endsWith(m)) return m;
  return null;
}

export function isToneBearing(p: Phoneme): boolean {
  return isVowel(stripTone(p));
}

/**
 * Phase 30 Tranche 30a: cap tone-mark stacking on a segment. Any
 * tone-bearing segment with > MAX_TONE_MARKS contour tokens collapses
 * to a single canonical tone (the rightmost matched). Used by
 * sound-change apply paths that build segments by concatenation
 * (`base + tone`) so unbounded stacks like `e˥˥˧˥˧˥` become `e˧˥`.
 */
const MAX_TONE_MARKS = 1;

export function capToneStacking(p: Phoneme): Phoneme {
  // Count contour tokens: scan from the right, collecting matches.
  const tones: string[] = [];
  let rest = p;
  while (true) {
    let matched: string | null = null;
    for (const m of TONE_MARKS) {
      if (rest.endsWith(m)) {
        matched = m;
        break;
      }
    }
    if (!matched) break;
    tones.unshift(matched);
    rest = rest.slice(0, -matched.length);
    if (tones.length > 6) break; // defensive
  }
  if (tones.length <= MAX_TONE_MARKS) return p;
  // Collapse: keep the rightmost (most-recently-applied) tone.
  return rest + tones[tones.length - 1];
}
