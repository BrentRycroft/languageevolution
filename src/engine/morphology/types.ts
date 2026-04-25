import type { Phoneme } from "../primitives";

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
  | "verb.aspect.prog"
  | "verb.mood.subj"
  | "verb.mood.imp"
  | "verb.voice.pass"
  | "verb.person.1sg"
  | "verb.person.2sg"
  | "verb.person.3sg"
  | "verb.person.1pl"
  | "verb.person.2pl"
  | "verb.person.3pl"
  | "adj.num.pl"
  | "adj.degree.cmp"
  | "adj.degree.sup"
  | "discourse.q"
  | "discourse.topic"
  | "discourse.emph";

/**
 * Phonological condition for selecting a paradigm variant. Real
 * languages develop conjugation/declension classes by promoting a
 * phonologically-conditioned alternation into a memorised
 * lexical class — Latin's four conjugations all start as
 * stem-vowel quality, Russian's first/second class begins as
 * stem-final consonant quality, etc. The simulator uses a coarse
 * version of this: stems ending in a vowel vs ending in a
 * consonant. Future: stem-final voicing, stress-class.
 */
export type StemShape = "vowel-final" | "consonant-final";

export interface ParadigmVariant {
  /** Which stems use this variant; default is the base affix. */
  when: StemShape;
  affix: Phoneme[];
}

export interface Paradigm {
  affix: Phoneme[];
  position: "prefix" | "suffix";
  category: MorphCategory;
  /**
   * Phonologically-conditioned variants. When present, `inflect`
   * picks the matching variant based on the stem's final
   * phoneme shape and falls back to `affix` if no variant matches.
   * Two-way splits (vowel-final vs consonant-final) emerge over time
   * via `morphology/evolve.ts::maybeSplitParadigm`.
   */
  variants?: ParadigmVariant[];
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
