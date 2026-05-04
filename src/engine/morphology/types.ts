import type { Phoneme } from "../primitives";

export type MorphCategory =
  | "noun.case.nom"
  | "noun.case.acc"
  | "noun.case.gen"
  | "noun.case.dat"
  | "noun.case.loc"
  | "noun.case.inst"
  | "noun.case.abl"
  | "noun.case.erg"
  | "noun.case.abs"
  | "noun.num.pl"
  | "noun.num.du"
  | "noun.num.pauc"
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
  | "verb.aspect.prog"
  | "verb.aspect.hab"
  | "verb.aspect.perf"
  | "verb.aspect.prosp"
  | "verb.mood.subj"
  | "verb.mood.imp"
  | "verb.mood.cond"
  | "verb.mood.opt"
  | "verb.voice.pass"
  | "verb.evid.dir"
  | "verb.evid.rep"
  | "verb.evid.inf"
  | "verb.cls.match"
  | "verb.person.1sg"
  | "verb.person.2sg"
  | "verb.person.3sg"
  | "verb.person.1pl"
  | "verb.person.2pl"
  | "verb.person.3pl"
  | "verb.honor.formal"
  | "verb.form.infinitive"
  | "adj.num.pl"
  | "adj.degree.cmp"
  | "adj.degree.sup"
  | "discourse.q"
  | "discourse.topic"
  | "discourse.emph";

export type StemShape = "vowel-final" | "consonant-final";

/**
 * Phase 29 Tranche 5e: inflection class. Latin-style 1st/2nd/3rd/4th
 * conjugations (or noun declensions). Each language assigns each
 * inflectable meaning to one class; paradigms can carry per-class
 * affix overrides via `Paradigm.byClass`.
 *
 * Default class is 1 (most common). Languages with no classification
 * system simply leave inflectionClass undefined for all meanings.
 */
export type InflectionClass = 1 | 2 | 3 | 4;

/**
 * A `when` predicate selects an affix variant for a given stem.
 *
 * - `"vowel-final"` / `"consonant-final"` — match the last segment.
 * - `"gender:N"` — match nouns/adjectives whose gender is N.
 * - `"class:N"` — match the inflectionClass of the meaning (Phase 29 5e).
 *
 * For an MVP, the matcher checks class first (if specified and the
 * meaning has a class), then gender, then stem-shape variants.
 */
export type ParadigmCondition = StemShape | `gender:${number}` | `class:${number}`;

export interface ParadigmVariant {
  when: ParadigmCondition;
  affix: Phoneme[];
}

export interface Paradigm {
  affix: Phoneme[];
  position: "prefix" | "suffix";
  category: MorphCategory;
  variants?: ParadigmVariant[];
  source?: { meaning: string; pathway: string };
}

export interface Morphology {
  paradigms: Partial<Record<MorphCategory, Paradigm>>;
}
