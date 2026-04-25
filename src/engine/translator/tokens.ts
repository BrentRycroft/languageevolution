/**
 * Tokeniser-side type declarations for the translator. Lives separate
 * from `sentence.ts` so `parse.ts` can import them without dragging in
 * the runtime tokeniser + creating an import cycle (sentence depends
 * on parseSyntax from parse.ts; parse.ts depends on these types).
 */

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
    /** Adjective degree: comparative ("bigger") or superlative
     *  ("biggest"). Default positive when absent. */
    degree?: "positive" | "comparative" | "superlative";
    /** Set when the source surface ended with `'s` — marks a
     *  possessor noun ("king's wolf" → king has possessor=true,
     *  wolf is the head). */
    possessor?: boolean;
  };
}
