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

/**
 * A point-native lexeme record (store unification, step 5 S1). One entry per lexeme:
 *   - form:  current surface form.
 *   - point: meaning position (fixed-point ints as number[], clone/JSON friendly).
 *   - gloss: present for seeded/concept-coined lexemes; ABSENT for keyless lexemes
 *            (coined into an empty region — meaning is the point, label is emergent).
 */
export interface LexemeRecord {
  form: WordForm;
  point: number[];
  gloss?: Meaning;
}

/** The canonical lexeme store: LexemeId -> record. Replaces the form-only Lexicon + keylessLexemes. */
export type LexemeStore = Record<string, LexemeRecord>;
