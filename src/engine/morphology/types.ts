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
  | "verb.mood.jus"
  | "verb.mood.irr"
  | "verb.mood.dub"
  | "verb.mood.hort"
  // Phase 36 Tranche 36j: switch-reference morphology.
  | "verb.subord.ss"  // same-subject as matrix
  | "verb.subord.ds"  // different-subject from matrix
  | "verb.voice.pass"
  | "verb.evid.dir"
  | "verb.evid.rep"
  | "verb.evid.inf"
  | "verb.cls.match"
  | "verb.cls.1"
  | "verb.cls.2"
  | "verb.cls.3"
  | "verb.cls.4"
  | "verb.cls.5"
  | "verb.cls.6"
  | "verb.cls.7"
  | "verb.cls.8"
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

/**
 * Phase 36 Tranche 36t: type-level distinction between inflectional
 * and derivational morphology. Inflectional categories are required
 * by syntax (number, case, tense, person) and apply to whole
 * classes; derivational schemas are optional and create new lexemes.
 *
 * The current `MorphCategory` union is kept unchanged for back-
 * compat. New code wanting strict inflection-only typing should use
 * `InflMorphCategory`. Derivational morphemes carry a separate
 * `DerivationalSchema` shape with productivity tracking.
 */
export type InflMorphCategory = Exclude<
  MorphCategory,
  // Currently no derivational categories live in the union — all
  // entries are inflectional. Once 36f-style bound morphemes
  // (-er.agt, -ness) become first-class, they migrate into a
  // separate `DerivMorphCategory` alias and this Exclude grows.
  never
>;

export interface DerivationalSchema {
  /** Semantic tag of the derived word (agentive, abstract, diminutive, …). */
  tag: string;
  /** Affix form, threaded through phonological evolution like any lexicon entry. */
  affix: Phoneme[];
  position: "prefix" | "suffix";
  /**
   * Number of attested derivations seeded with this schema. Crosses
   * `productivityThreshold` to enable ad-hoc coinage.
   */
  attestations: number;
  productivityThreshold: number;
  /**
   * Restricts which base POS this schema can attach to. e.g.,
   * "verb" for agentive -er, "adj" for abstract -ness.
   */
  baseClass?: "noun" | "verb" | "adj";
}
