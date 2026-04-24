import type { Meaning, Phoneme, WordForm } from "../types";
import { isVowel } from "./ipa";
import { stripTone } from "./tone";

export const STRESS_MARK = "ˈ";

/**
 * Locate indices of vowel phonemes in a form.
 */
export function vowelIndices(form: WordForm): number[] {
  const idxs: number[] = [];
  for (let i = 0; i < form.length; i++) {
    if (isVowel(stripTone(form[i]!))) idxs.push(i);
  }
  return idxs;
}

export type StressPattern = "initial" | "penult" | "final";

/**
 * Given a form and a stress pattern, return the index of the vowel that
 * carries primary stress. Returns -1 if the form has no vowels.
 * Default pattern is "penult" (back-compat with the old hardcoded rule).
 */
export function stressIndex(form: WordForm, pattern: StressPattern = "penult"): number {
  const vs = vowelIndices(form);
  if (vs.length === 0) return -1;
  if (vs.length === 1) return vs[0]!;
  switch (pattern) {
    case "initial":
      return vs[0]!;
    case "final":
      return vs[vs.length - 1]!;
    case "penult":
    default:
      return vs[vs.length - 2]!;
  }
}

/**
 * Legacy penultimate-only alias — kept for callers that don't yet thread
 * a language's stress pattern through. New code should prefer
 * `stressIndex(form, pattern)`.
 */
export function penultimateStressIndex(form: WordForm): number {
  return stressIndex(form, "penult");
}

/**
 * Classify a vowel index by stress:
 *   "stressed"   — carries primary stress (resists sound change)
 *   "pretonic"   — one before stressed, mildly protected
 *   "unstressed" — everything else (prime target for reduction)
 */
export function stressClass(
  form: WordForm,
  vowelIdx: number,
  pattern: StressPattern = "penult",
): "stressed" | "pretonic" | "unstressed" {
  const stress = stressIndex(form, pattern);
  if (vowelIdx === stress) return "stressed";
  if (vowelIdx === stress - 1 || vowelIdx === stress - 2) return "pretonic";
  return "unstressed";
}

/**
 * Probability that a sound change at position `i` actually applies to this
 * phoneme, based on stress. Multiplies into the base per-site probability
 * already computed by the change rule. Only applies to vowels; consonants
 * default to 1.0.
 */
export function stressSensitivity(
  form: WordForm,
  i: number,
  pattern: StressPattern = "penult",
): number {
  const p = form[i];
  if (!p || !isVowel(stripTone(p))) return 1.0;
  const cls = stressClass(form, i, pattern);
  if (cls === "stressed") return 0.35;
  if (cls === "pretonic") return 0.85;
  return 1.25;
}

/**
 * Unstressed-vowel reduction rule. Probability grows with the number of
 * unstressed vowels; outcome shortens the word by converting the target to
 * schwa. Compatible with the SoundChange contract used elsewhere.
 */
import type { SoundChange } from "../types";

export const UNSTRESSED_REDUCTION: SoundChange = {
  id: "stress.unstressed_reduction",
  label: "V → ə / unstressed",
  category: "vowel",
  description:
    "Unstressed vowels reduce toward schwa. Stressed vowels resist; pretonic slightly protected.",
  probabilityFor: (word) => {
    let n = 0;
    for (let i = 0; i < word.length; i++) {
      const p = word[i]!;
      if (!isVowel(stripTone(p))) continue;
      if (stripTone(p) === "ə") continue;
      if (stressClass(word, i) === "unstressed") n++;
    }
    return 1 - Math.pow(1 - 0.06, n);
  },
  apply: (word, rng) => {
    const sites: number[] = [];
    for (let i = 0; i < word.length; i++) {
      const p = word[i]!;
      if (!isVowel(stripTone(p))) continue;
      if (stripTone(p) === "ə") continue;
      if (stressClass(word, i) === "unstressed") sites.push(i);
    }
    if (sites.length === 0) return word;
    const idx = sites[rng.int(sites.length)]!;
    const out = word.slice();
    // Keep tone if present.
    const tone = word[idx]!.length > stripTone(word[idx]!).length ? word[idx]!.slice(stripTone(word[idx]!).length) : "";
    out[idx] = "ə" + tone;
    return out;
  },
  enabledByDefault: false,
  baseWeight: 1,
};

// silence unused-imports when Meaning / Phoneme aren't referenced directly.
export type _MeaningRef = Meaning;
export type _PhonemeRef = Phoneme;
