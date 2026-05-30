
/**
 * tokens.ts
 *
 * English → target sentence (parse / realise / sentence) and target → English caption (glossToEnglish, cognates, reverse). Key exports: EnglishTag, EnglishToken, WH_LEMMAS.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
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
    degree?: "positive" | "comparative" | "superlative" | "intensive";
    possessor?: boolean;
  };
}

export const WH_LEMMAS: ReadonlySet<string> = new Set([
  "who", "whom", "whose",
  "what", "which",
  "where", "when", "why", "how",
]);
