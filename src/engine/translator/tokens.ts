
export type EnglishTag =
  | "N" | "V" | "ADJ" | "ADV"
  | "DET" | "PRON" | "PREP" | "CONJ" | "PUNCT" | "AUX" | "NUM";

export interface EnglishToken {
  surface: string;
  lemma: string;
  tag: EnglishTag;
  features: {
    tense?: "past" | "present" | "future";
    number?: "sg" | "pl";
    person?: "1" | "2" | "3";
    role?: "subject" | "object";
    degree?: "positive" | "comparative" | "superlative";
    possessor?: boolean;
  };
}

export const WH_LEMMAS: ReadonlySet<string> = new Set([
  "who", "whom", "whose",
  "what", "which",
  "where", "when", "why", "how",
]);
