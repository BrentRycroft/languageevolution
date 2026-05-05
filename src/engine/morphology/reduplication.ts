import type { Phoneme, WordForm } from "../types";
import { isVowel } from "../phonology/ipa";

/**
 * Phase 36 Tranche 36a: reduplication as a non-affixal morphological
 * operation. Used as an alternative to affix-based plural marking
 * (Bantu, Austronesian, Salish-style) and reserved for use elsewhere
 * (intensification, distributive aspect, etc.).
 *
 * Modes:
 * - "full": copy the whole form. CVCV → CVCVCVCV. Indonesian "orang-orang".
 * - "partial-initial": copy the leading C(C)V and prepend.
 *   ka.no → ka-ka.no. Bantu plural-of-plurals, Tagalog actor focus.
 * - "partial-final": copy the trailing CV and append.
 *   ka.no → ka.no-no. Marshallese, some Salish patterns.
 *
 * Returns the original form unchanged when reduplication is impossible
 * (e.g., empty form, single-segment form for partial modes).
 */
export type ReduplicationMode = "full" | "partial-initial" | "partial-final";

export function reduplicate(form: WordForm, mode: ReduplicationMode): WordForm {
  if (form.length === 0) return form;
  if (mode === "full") return [...form, ...form];
  if (mode === "partial-initial") return prependPartial(form);
  return appendPartial(form);
}

function prependPartial(form: WordForm): WordForm {
  // Find the first vowel index. Copy from start through that vowel
  // (giving us C(C)V or V if vowel-initial) and prepend it.
  const firstV = findVowel(form, 0, 1);
  if (firstV < 0) return form;
  const prefix: Phoneme[] = form.slice(0, firstV + 1);
  if (prefix.length === 0) return form;
  return [...prefix, ...form];
}

function appendPartial(form: WordForm): WordForm {
  // Find the last vowel. Copy from that vowel through the end
  // (giving us VC or V) and append.
  const lastV = findVowel(form, form.length - 1, -1);
  if (lastV < 0) return form;
  const suffix: Phoneme[] = form.slice(lastV);
  if (suffix.length === 0) return form;
  return [...form, ...suffix];
}

function findVowel(form: WordForm, start: number, step: 1 | -1): number {
  for (let i = start; i >= 0 && i < form.length; i += step) {
    const p = form[i]!;
    if (isVowel(p)) return i;
  }
  return -1;
}
