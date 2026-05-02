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
  | "adj.num.pl"
  | "adj.degree.cmp"
  | "adj.degree.sup"
  | "discourse.q"
  | "discourse.topic"
  | "discourse.emph";

export type StemShape = "vowel-final" | "consonant-final";

/**
 * A `when` predicate selects an affix variant for a given stem.
 *
 * - `"vowel-final"` / `"consonant-final"` — match the last segment.
 * - `"gender:N"` — match nouns/adjectives whose gender is N.
 *
 * For an MVP, the matcher checks gender first (if specified and provided),
 * then falls back to stem-shape variants.
 */
export type ParadigmCondition = StemShape | `gender:${number}`;

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
