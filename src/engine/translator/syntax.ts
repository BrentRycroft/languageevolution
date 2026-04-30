import type { WordForm } from "../types";

export type Person = "1" | "2" | "3";
export type Number_ = "sg" | "pl";
export type Case = "nom" | "acc" | "dat" | "gen" | "obl" | "inst";

export type LemmaResolution = "direct" | "concept" | "colex" | "reverse-colex" | "fallback";

export interface NounRef {
  lemma: string;
  baseForm: WordForm;
  number: Number_;
  case: Case;
  person?: Person;
  isPronoun?: boolean;
  resolution?: LemmaResolution;
  synthesized?: boolean;
}

export type Aspect = "perfective" | "imperfective" | "progressive";
export type Mood = "declarative" | "subjunctive" | "imperative";
export type Voice = "active" | "passive";
export type Degree = "positive" | "comparative" | "superlative";

export interface VerbRef {
  lemma: string;
  baseForm: WordForm;
  tense: "past" | "present" | "future";
  subjectPerson?: Person;
  subjectNumber?: Number_;
  resolution?: LemmaResolution;
  aspect?: Aspect;
  mood?: Mood;
  voice?: Voice;
}

export interface AdjRef {
  lemma: string;
  baseForm: WordForm;
  resolution?: LemmaResolution;
  degree?: Degree;
}

export interface PrepRef {
  lemma: string;
}

export interface NP {
  kind: "NP";
  head: NounRef;
  determiner?: { lemma: string };
  adjectives: AdjRef[];
  possessor?: NP;
  numeral?: { lemma: string };
  pps: PP[];
  coord?: { lemma: string; np: NP };
}

export interface PP {
  kind: "PP";
  prep: PrepRef;
  np: NP;
}

export interface VP {
  kind: "VP";
  verb: VerbRef;
  object?: NP;
  pps: PP[];
  adverbs: AdjRef[];
  complement?: AdjRef[];
}

export interface Sentence {
  kind: "S";
  subject: NP;
  predicate: VP;
  negated: boolean;
  interrogative?: boolean;
  leadingConj?: { lemma: string };
  leadingWh?: { lemma: string };
}
