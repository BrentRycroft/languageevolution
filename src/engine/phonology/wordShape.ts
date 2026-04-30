import type { Meaning, WordForm } from "../types";
import { isSyllabic, isVowel } from "./ipa";

const RESONANT_BASES: Record<string, string> = {
  l: "l̩",
  r: "r̩",
  m: "m̩",
  n: "n̩",
};

export function repairSyllabicity(form: WordForm): WordForm {
  if (form.length === 0) return form;
  if (form.some((p) => isSyllabic(p))) return form;
  void isVowel;
  for (let i = form.length - 1; i >= 0; i--) {
    const replacement = RESONANT_BASES[form[i]!];
    if (replacement) {
      const out = form.slice();
      out[i] = replacement;
      return out;
    }
  }
  return form;
}

export const ALLOWED_MONOSYLLABIC: ReadonlySet<Meaning> = new Set([
  "i",
  "you",
  "we",
  "they",
  "he",
  "she",
  "it",
  "this",
  "that",
  "here",
  "there",
  "a",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "at",
  "on",
]);

export function hasSyllabicNucleus(form: WordForm): boolean {
  for (const p of form) if (isSyllabic(p)) return true;
  return false;
}

export function isFormLegal(meaning: Meaning, form: WordForm): boolean {
  if (form.length >= 2) return hasSyllabicNucleus(form);
  if (form.length === 0) return false;
  if (!ALLOWED_MONOSYLLABIC.has(meaning)) return false;
  return isSyllabic(form[0]!);
}
