import type { Phoneme } from "../types";

export type MorphCategory =
  | "noun.case.nom"
  | "noun.case.acc"
  | "noun.case.gen"
  | "noun.case.dat"
  | "noun.case.loc"
  | "noun.case.inst"
  | "noun.case.abl"
  | "noun.num.pl"
  | "noun.num.du"
  | "noun.class.1"
  | "noun.class.2"
  | "noun.class.3"
  | "noun.class.4"
  | "noun.class.5"
  | "noun.class.6"
  | "noun.class.7"
  | "noun.class.8"
  | "verb.tense.past"
  | "verb.tense.fut"
  | "verb.aspect.pfv"
  | "verb.aspect.ipfv"
  | "verb.person.1sg"
  | "verb.person.2sg"
  | "verb.person.3sg";

export interface Paradigm {
  affix: Phoneme[];
  position: "prefix" | "suffix";
  category: MorphCategory;
  /**
   * If this paradigm was born via grammaticalization, the source meaning
   * and pathway tag. Lets the Grammar UI show etymologies like
   * "fut ← motion verb 'go'".
   */
  source?: { meaning: string; pathway: string };
}

export interface Morphology {
  paradigms: Partial<Record<MorphCategory, Paradigm>>;
}
