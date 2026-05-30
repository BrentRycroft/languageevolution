import type { WordForm } from "../types";

/**
 * syntax.ts
 *
 * English → target sentence (parse / realise / sentence) and target → English caption (glossToEnglish, cognates, reverse). Key exports: Person, Number_, Case.
 *
 * Phase 73c Tier C migration status (as of Phase 6):
 *   - The `Sentence` / `NP` / `VP` / `PP` / `RelativeClause` shapes
 *     below are the LEGACY English-shaped parse tree. They remain
 *     in active use because the realiser (`realise.ts`) still
 *     consumes them; the role-IR-emitting parser and composer
 *     bridge through `roleClauseToSentence` for back-compat.
 *   - The NEW types (`RoleClause`, `Participant`, `PredicateFrame`,
 *     `ParticipantModifier`, `SemanticRole`) re-exported below
 *     live in `./roleFrame.ts`. New code should prefer these.
 *   - The legacy types are NOT yet `@deprecated` — Phase 6 stops
 *     short of marking them so because the realiser internal
 *     rewrite (originally planned for Phase 4) was scoped down;
 *     removing the legacy types would require Phase 4's deferred
 *     work to land first.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export type Person = "1" | "2" | "3";
export type Number_ = "sg" | "pl";
export type Case = "nom" | "acc" | "dat" | "gen" | "obl" | "inst";

export type LemmaResolution = "direct" | "concept" | "colex" | "reverse-colex" | "fallback" | "synth-affix" | "synth-neg-affix" | "synth-concept" | "synth-cluster" | "synth-fallback";

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
export type Degree = "positive" | "comparative" | "superlative" | "intensive";
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
  /**
   * Phase 74: the relative clause's own subject, for OBJECT relatives
   * ("the dog that THE KING sees" — subjectGap=false). When omitted
   * (subject relatives, subjectGap=true) the head NP is the subject.
   */
  subject?: NP;
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

// Tier C Phase 0 (Phase 73c): role-frame IR. Defined in
// `./roleFrame.ts`; re-exported here so existing imports of
// `./syntax` discover the new types without changing their
// import paths once Phase 2+ start consuming them.
export type {
  SemanticRole,
  ParticipantFeatures,
  ParticipantModifier,
  Participant,
  PredicateFeatures,
  PredicateFrame,
  RoleClause,
} from "./roleFrame";
