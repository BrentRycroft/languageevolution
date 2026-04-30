export type Phoneme = string;
export type Meaning = string;
export type WordForm = Phoneme[];
export type Lexicon = Record<Meaning, WordForm>;
