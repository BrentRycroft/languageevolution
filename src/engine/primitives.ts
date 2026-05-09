/**
 * primitives.ts
 *
 * atomic primitives (Phoneme, Meaning, WordForm, Lexicon). Key exports: Phoneme, Meaning, WordForm.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export type Phoneme = string;
export type Meaning = string;
export type WordForm = Phoneme[];
export type Lexicon = Record<Meaning, WordForm>;
