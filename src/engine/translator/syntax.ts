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
  nounClass?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export type Aspect =
  | "perfective"
  | "imperfective"
  | "progressive"
  | "habitual"
  | "perfect"
  | "prospective";
export type Mood =
  | "declarative"
  | "subjunctive"
  | "imperative"
  | "conditional"
  | "optative"
  // Phase 36 Tranche 36l: extended mood inventory.
  | "jussive"     // 3rd-person directive ("let him come")
  | "irrealis"    // counterfactual / hypothetical, distinct from subj
  | "dubitative"  // speaker uncertainty
  | "hortative";  // 1pl directive ("let us go")
export type Voice = "active" | "passive";
export type Degree = "positive" | "comparative" | "superlative";
export type Evidential = "direct" | "reportative" | "inferred";

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
  evidential?: Evidential;
  honorific?: boolean;
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
  relative?: RelativeClause;
}

export interface RelativeClause {
  kind: "RC";
  relativizer: "who" | "that" | "which";
  predicate: VP;
  subjectGap: boolean;
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
  /**
   * Phase 36 Tranche 36b: subject's noun-class. Set after the
   * subject NP is realised so the VP realiser can pick the matching
   * verb-class agreement paradigm.
   */
  subjectNounClass?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /**
   * Phase 36 Tranche 36j: switch-reference flag. Set on subordinate
   * clauses when the language tracks SR; "same" → verb.subord.ss,
   * "different" → verb.subord.ds. Heuristically derived from subject
   * pronoun-vs-full-noun status when no upstream coreference data
   * is available.
   */
  subordSubjectCoreference?: "same" | "different";
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
