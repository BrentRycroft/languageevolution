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
 * Phase 30 Tranche 30a + Phase 31 Tranche 31a: strip ALL tone marks
 * regardless of position in the segment string. Pre-Phase-31 only
 * trailing tones were stripped, so an interleaved segment like
 * `eː˧ː` (long-e + mid-tone + length) survived because `ː` is at the
 * rightmost position and isn't a tone. This produced phantom
 * inventory entries where the same phoneme appeared as e/eː/eː˧/eː˧ː
 * etc. Now stripTone removes every tone token anywhere in the
 * string, returning the pure base+length segment.
 */
export function stripTone(p: Phoneme): Phoneme {
  let out = p;
  for (const m of TONE_MARKS) {
    while (true) {
      const idx = out.indexOf(m);
      if (idx === -1) break;
      out = out.slice(0, idx) + out.slice(idx + m.length);
    }
  }
  return out;
}

/**
 * Returns the rightmost tone mark on a phoneme, or null. Pre-Phase-31
 * this only checked endsWith; Phase 31 also detects tones embedded
 * before secondary diacritics (length, nasalisation) like the `˧` in
 * `eː˧ː`.
 */
export function toneOf(p: Phoneme): string | null {
  for (const m of TONE_MARKS) if (p.endsWith(m)) return m;
  // Phase 31 Tranche 31a: scan for embedded tone (rule applications
  // can leave tones before secondary diacritics — `eː˧ː`, `e˧̃`).
  // Return the LAST one found in the string so toneOf agrees with
  // "this segment is tone-bearing."
  for (const m of TONE_MARKS) {
    const idx = p.lastIndexOf(m);
    if (idx >= 0) return m;
  }
  return null;
}

export function isToneBearing(p: Phoneme): boolean {
  return isVowel(stripTone(p));
}

/**
 * Phase 32 Tranche 32b: detect whether a segment carries a length
 * marker (ː) anywhere — not just trailing. Pre-fix `endsWith("ː")`
 * missed segments where tone was placed AFTER length, like `aː˧`,
 * letting lengthening rules re-apply and produce `aː˧ː` (double
 * length). After Phase 32b, length-adding rules check `hasLength`
 * instead, blocking re-application and keeping vowel mora-count to
 * at most 2 (short vs long).
 */
export function hasLength(p: Phoneme): boolean {
  return stripTone(p).includes("ː");
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
