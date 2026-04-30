import type { WordForm } from "../types";
import { isVowel } from "./ipa";
import { stripTone } from "./tone";

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

export type StressPattern =
  | "initial"
  | "penult"
  | "final"
  | "antepenult"
  | "lexical";

/**
 * Given a form and a stress pattern, return the index of the vowel that
 * carries primary stress. Returns -1 if the form has no vowels.
 *
 *   `initial`     — first vowel
 *   `penult`      — second-to-last vowel (default; back-compat)
 *   `final`       — last vowel
 *   `antepenult`  — third-from-last (Macedonian, some Romance reflexes)
 *   `lexical`     — caller supplies an explicit `lexicalIdx` (the
 *                   stressed *vowel* index in the form). Falls back to
 *                   penult when no override is supplied. Models PIE
 *                   mobile accent.
 */
export function stressIndex(
  form: WordForm,
  pattern: StressPattern = "penult",
  lexicalIdx?: number,
): number {
  const vs = vowelIndices(form);
  if (vs.length === 0) return -1;
  if (vs.length === 1) return vs[0]!;
  switch (pattern) {
    case "initial":
      return vs[0]!;
    case "final":
      return vs[vs.length - 1]!;
    case "antepenult":
      return vs[Math.max(0, vs.length - 3)]!;
    case "lexical":
      // `lexicalIdx` is the *vowel-position index* (0-based) within
      // the form's vowel sequence. Validate; fall back to penult.
      if (lexicalIdx !== undefined && lexicalIdx >= 0 && lexicalIdx < vs.length) {
        return vs[lexicalIdx]!;
      }
      return vs[vs.length - 2]!;
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
  lexicalIdx?: number,
): "stressed" | "pretonic" | "unstressed" {
  const stress = stressIndex(form, pattern, lexicalIdx);
  if (vowelIdx === stress) return "stressed";
  if (vowelIdx === stress - 1 || vowelIdx === stress - 2) return "pretonic";
  return "unstressed";
}

/**
 * Return the indices of every vowel matching the given stress class.
 * Convenience for rule authors: avoids reimplementing the
 * vowel-loop + stressClass-check on every rule. Pretonic class
 * matches both immediate and second-pretonic positions.
 */
export function stressedPositions(
  form: WordForm,
  filter: "stressed" | "unstressed" | "pretonic",
  pattern: StressPattern = "penult",
  lexicalIdx?: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < form.length; i++) {
    const p = form[i]!;
    if (!isVowel(stripTone(p))) continue;
    if (stressClass(form, i, pattern, lexicalIdx) === filter) out.push(i);
  }
  return out;
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
  // Declarative stress filter — `apply.ts` short-circuits the rule
  // when no unstressed vowel exists, so the inner `probabilityFor`
  // / `apply` callbacks only ever see candidate sites.
  stressFilter: "unstressed",
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

