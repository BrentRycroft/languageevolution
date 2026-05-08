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
 * Phase 64 T1: noun declension class. Real languages partition
 * nouns into declension buckets: Latin has 5 declensions (-a stems,
 * -o/-us, consonant stems, -u stems, -e stems); Russian has 3;
 * Bantu has 10+. Each declension takes a different case-ending set.
 *
 * Default 1. Languages without a noun-declension system leave
 * `lang.nounDeclensionClass` unpopulated and pickAffixVariant falls
 * through to gender / stem-shape matching as before.
 */
export type NounDeclensionClass = 1 | 2 | 3 | 4 | 5;

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

/**
 * Phase 52 T2: paradigm kind discriminator. Pre-Phase-52 the engine
 * supported only concatenative `affix` (prefix/suffix) paradigms.
 * Adding kinds extends `applyParadigm` (`morphology/apply.ts`) without
 * any caller change — translator + narrative go through the
 * abstraction layer (Phase 52 T1), so a new paradigm kind is invisible
 * to them.
 *
 * - `affix`: prefix or suffix concatenation (legacy default).
 * - `infix`: insert affix into the stem at `insertionPoint`. Tagalog
 *   `-um-` (sulat → sumulat).
 * - `circumfix`: split affix into prefix + suffix halves, separated
 *   by `_`. German `ge_t` (kauf → gekauft).
 * - `reduplicate`: full / partial-initial / partial-final copy of
 *   the stem (Bantu, Austronesian).
 * - `ablaut`: vowel mutation per `ablautMap`. Strong-verb sing → sang.
 * - `template`: Semitic root + CV template. k-t-b + CaCiC → katib.
 * - `conversion`: identity transformation; zero-derivation.
 */
export type ParadigmKind =
  | "affix"
  | "infix"
  | "circumfix"
  | "reduplicate"
  | "ablaut"
  | "template"
  | "conversion";

export type ParadigmInsertionPoint =
  | "after-first-V"
  | "before-last-V"
  | "before-last-C";

export type ParadigmReduplicationMode =
  | "full"
  | "partial-initial"
  | "partial-final";

export interface Paradigm {
  affix: Phoneme[];
  position: "prefix" | "suffix";
  category: MorphCategory;
  variants?: ParadigmVariant[];
  source?: { meaning: string; pathway: string };
  // Phase 52 T2: optional kind discriminator. Defaults to `"affix"` for
  // back-compat with every save / preset shipped before Phase 52.
  kind?: ParadigmKind;
  // Used by `kind: "infix"` to declare where the affix is spliced.
  insertionPoint?: ParadigmInsertionPoint;
  // Used by `kind: "circumfix"`: the affix is split on the literal
  // `_` separator — `["g","e","_","t"]` means prefix `ge` + suffix `t`.
  // Falls back to using the whole affix as prefix if no separator.
  // Used by `kind: "reduplicate"`: which mode to apply.
  reduplication?: ParadigmReduplicationMode;
  // Used by `kind: "ablaut"`: replace each occurrence of key with value.
  ablautMap?: Record<string, string>;
  // Used by `kind: "template"`: Semitic-style CV template, `C` slots
  // filled by root consonants, `V` slots by `templateVowel` (or `i`).
  templatePattern?: string;
  templateVowel?: string;
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
