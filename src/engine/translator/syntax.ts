import type { WordForm } from "../types";

/**
 * Tiny dependency-tree representation for a single English clause.
 *
 * We don't aim for a full constituency parser — the simulator only ever
 * needs to translate short user-supplied sentences plus narrative
 * one-liners. So the tree carries just enough structure to drive
 * realisation choices that depend on grammatical relations:
 *
 *   - subject-verb agreement (verb form picks up subject's person+number)
 *   - adjective placement (pre/post head noun)
 *   - possessor placement (pre/post head noun)
 *   - numeral placement (pre/post head noun)
 *   - PP order (preposition + NP vs. NP + postposition)
 *   - negation insertion (pre-verb / post-verb / morphological)
 *   - prodrop (subject pronoun omission when verb agrees)
 *
 * Each leaf carries the original English lemma + the resolved target
 * form so the realiser can re-inflect under tree-driven choices.
 */

export type Person = "1" | "2" | "3";
export type Number_ = "sg" | "pl";
export type Case = "nom" | "acc" | "dat" | "gen" | "obl";

/** How an open-class lemma was resolved against a target language. */
export type LemmaResolution = "direct" | "concept" | "colex" | "reverse-colex" | "fallback";

export interface NounRef {
  lemma: string;
  baseForm: WordForm;
  number: Number_;
  case: Case;
  person?: Person;
  /** True when the noun is actually a pronoun ("he", "they"). */
  isPronoun?: boolean;
  /** Stamped by the realiser's populate step. */
  resolution?: LemmaResolution;
}

export type Aspect = "perfective" | "imperfective" | "progressive";
export type Mood = "declarative" | "subjunctive" | "imperative";
export type Voice = "active" | "passive";
export type Degree = "positive" | "comparative" | "superlative";

export interface VerbRef {
  lemma: string;
  baseForm: WordForm;
  tense: "past" | "present" | "future";
  /** Subject features inherited via agreement; filled by the parser. */
  subjectPerson?: Person;
  subjectNumber?: Number_;
  resolution?: LemmaResolution;
  /** Filled by the parser when the input carries a clear aspect cue
   *  ("is X-ing" → progressive; "has X-ed" → perfective). */
  aspect?: Aspect;
  mood?: Mood;
  voice?: Voice;
}

export interface AdjRef {
  lemma: string;
  baseForm: WordForm;
  resolution?: LemmaResolution;
  /** Default `positive`; the tokeniser flags comparative ("bigger") /
   *  superlative ("biggest") forms. */
  degree?: Degree;
}

export interface PrepRef {
  /** English lemma — the closed-class table maps it to a target form. */
  lemma: string;
}

export interface NP {
  kind: "NP";
  head: NounRef;
  /** Article / determiner attached to this NP (the / a / this / my). */
  determiner?: { lemma: string };
  adjectives: AdjRef[];
  /** Genitive sub-NP (English "John's hat" → possessor: NP{John}). */
  possessor?: NP;
  /** Numeral modifier (English "three dogs"). */
  numeral?: { lemma: string };
  /** Prepositional / postpositional phrase modifying the head. */
  pps: PP[];
}

export interface PP {
  kind: "PP";
  prep: PrepRef;
  np: NP;
}

export interface VP {
  kind: "VP";
  verb: VerbRef;
  /** Direct object NP. */
  object?: NP;
  /** Adverbial PPs and bare adverbs (rendered after the verb). */
  pps: PP[];
  adverbs: AdjRef[];
  /**
   * Predicate complement of a copula clause: the adjective in
   * "X is happy" or the locative adverb in "X is here". Surfaces
   * after the verb in SVO realisation and lets the realiser drop
   * the verb in zero-copula languages while keeping subject +
   * complement intact ("X happy", "X here").
   */
  complement?: AdjRef[];
}

export interface Sentence {
  kind: "S";
  subject: NP;
  predicate: VP;
  /** Negated S — surfaces as morphological or syntactic negation. */
  negated: boolean;
  /** True for yes/no questions. Surfaces per `interrogativeStrategy`:
   *  particle / inversion / intonation. */
  interrogative?: boolean;
  /** Leading discourse coordinator ("And he ...", "But he ...").
   *  Surfaces before the subject so the connective isn't silently
   *  lost. */
  leadingConj?: { lemma: string };
}
