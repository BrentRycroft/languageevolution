/**
 * Leaf primitive types shared across the engine. Lives in its own
 * module so layered modules (morphology/types, phonology/generated,
 * etc.) can import these without going through `engine/types.ts`,
 * which would create an import cycle.
 */
export type Phoneme = string;
export type Meaning = string;
export type WordForm = Phoneme[];
export type Lexicon = Record<Meaning, WordForm>;
