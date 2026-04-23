import type { Meaning, WordForm } from "../types";
import { isSyllabic } from "./ipa";

/**
 * Meanings allowed to shrink to a single phoneme. In real languages the
 * only surface forms that get away with one segment are pronouns,
 * deictics, and bare-minimum grammatical particles — e.g. English
 * "a", "I"; French "a", "y"; Italian "a", "o", "e". Content words
 * must carry at least two segments. This prevents cascading deletion
 * rules from collapsing "water", "beer", "before" etc. all into /r/
 * or a single-vowel blur.
 */
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

/**
 * True when a form contains at least one segment that can carry a
 * syllable — a vowel or an explicitly-syllabic resonant. This is the
 * core "is this a word?" constraint.
 */
export function hasSyllabicNucleus(form: WordForm): boolean {
  for (const p of form) if (isSyllabic(p)) return true;
  return false;
}

/**
 * Is a post-change form legal for the given meaning?
 *
 * - Length ≥ 2 + has a nucleus: always legal.
 * - Length 1: legal only when the meaning is in
 *   `ALLOWED_MONOSYLLABIC` AND the lone segment is a nucleus (vowel
 *   or syllabic resonant). A lone consonant is never legal.
 * - Length 0: never legal.
 *
 * Intermediate apply steps that produce an illegal form are rolled
 * back by the caller — the rule may still succeed on a later pass.
 */
export function isFormLegal(meaning: Meaning, form: WordForm): boolean {
  if (form.length >= 2) return hasSyllabicNucleus(form);
  if (form.length === 0) return false;
  if (!ALLOWED_MONOSYLLABIC.has(meaning)) return false;
  return isSyllabic(form[0]!);
}
