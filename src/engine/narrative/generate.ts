import type { Language, Meaning, WordForm } from "../types";
import { makeRng, type Rng } from "../rng";
import { formToString } from "../phonology/ipa";
import { formatForm, type DisplayScript } from "../phonology/display";
import { inflect } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";

/**
 * Narrative generation is split into two stages so the Narrative view's
 * compare mode can render the same skeleton across two languages:
 *
 *  1. `planSkeleton(seedStr, lines)` deterministically picks the pattern
 *     index + meaning slots for each sentence from a seed that does NOT
 *     depend on any particular language. Both columns in compare mode
 *     call this with the same seed and get identical skeletons.
 *  2. `realizeSkeleton(lang, skeleton)` plugs each language's own
 *     lexicon, morphology, and word order into the skeleton to produce
 *     the rendered text + gloss.
 *
 * The user-visible consequence: "the {S} {V} the {adj} {O}" is the same
 * template in both columns; only the specific forms, affixes, and
 * surface order vary by language. That's the apple-to-apple comparison.
 */

const NOUN_POOL = [
  "mother", "father", "dog", "wolf", "horse", "cow", "bird", "fish",
  "hand", "foot", "tree", "water", "fire", "stone", "moon", "sun",
] as const;

const VERB_POOL = ["go", "come", "see", "know", "eat", "drink", "sleep", "die"] as const;

const ADJECTIVE_POOL = ["big", "small", "new", "old", "good", "bad"] as const;

interface SentencePattern {
  template: string;
  needsObject: boolean;
  needsAdj: boolean;
}

const SENTENCE_PATTERNS: SentencePattern[] = [
  { template: "The {adj} {S} {V}.", needsObject: false, needsAdj: true },
  { template: "The {S} {V} the {O}.", needsObject: true, needsAdj: false },
  { template: "The {S} {V} the {adj} {O}.", needsObject: true, needsAdj: true },
  { template: "{S} {V}.", needsObject: false, needsAdj: false },
];

/**
 * Language-agnostic sentence skeleton. Meanings are picked from fixed
 * pools using a seed-only RNG so every language that's asked to
 * realize this skeleton starts from the same structural choice. Each
 * language then falls back to its own lexicon when a meaning isn't
 * there.
 */
export interface Skeleton {
  patternIdx: number;
  subjectNoun: Meaning;
  verb: Meaning;
  objectNoun: Meaning;
  adjective: Meaning | null;
}

function pickFromPoolByIndex<T extends string>(pool: readonly T[], rng: Rng): T {
  return pool[rng.int(pool.length)]!;
}

export function planSkeleton(seedStr: string, lines: number): Skeleton[] {
  // Seed depends only on the user seed string + line count — not on
  // any language — so both compare-mode columns get the same plan.
  const rng = makeRng(`narrative:${seedStr}:${lines}`);
  const out: Skeleton[] = [];
  for (let i = 0; i < lines; i++) {
    const patternIdx = rng.int(SENTENCE_PATTERNS.length);
    const pattern = SENTENCE_PATTERNS[patternIdx]!;
    const subject = pickFromPoolByIndex(NOUN_POOL, rng);
    const verb = pickFromPoolByIndex(VERB_POOL, rng);
    // Still consume an RNG step for object + adjective even when the
    // pattern doesn't need them, so the stream stays deterministic
    // regardless of pattern choice. The unused values just get
    // dropped.
    const objectCand = pickFromPoolByIndex(NOUN_POOL, rng);
    const adjCand = pickFromPoolByIndex(ADJECTIVE_POOL, rng);
    out.push({
      patternIdx,
      subjectNoun: subject,
      verb,
      objectNoun: pattern.needsObject ? objectCand : subject,
      adjective: pattern.needsAdj ? adjCand : null,
    });
  }
  return out;
}

/**
 * Per-language fallback: if the planned meaning isn't in this
 * language's lexicon, walk the pool in a stable order looking for
 * something that is. As a last resort fall back to any non-compound
 * lexeme the language has. Returns null only if the language's
 * lexicon is effectively empty.
 */
function resolveMeaning(
  lang: Language,
  planned: Meaning,
  pool: readonly string[],
): Meaning | null {
  if (lang.lexicon[planned]) return planned;
  for (const m of pool) {
    if (lang.lexicon[m]) return m;
  }
  const all = Object.keys(lang.lexicon).filter((m) => !m.includes("-")).sort();
  return all.length > 0 ? all[0]! : null;
}

function inflectNoun(form: WordForm, lang: Language, role: "S" | "O"): WordForm {
  if (role === "S" && lang.grammar.pluralMarking === "affix") {
    const p = lang.morphology.paradigms["noun.num.pl"];
    if (p) return inflect(form, p);
  }
  if (role === "O" && lang.grammar.hasCase) {
    const acc = lang.morphology.paradigms["noun.case.acc"];
    if (acc) return inflect(form, acc);
  }
  return form;
}

function inflectVerb(form: WordForm, lang: Language): WordForm {
  const order: MorphCategory[] = [
    "verb.tense.past",
    "verb.tense.fut",
    "verb.aspect.ipfv",
    "verb.aspect.pfv",
    "verb.person.3sg",
  ];
  for (const cat of order) {
    const p = lang.morphology.paradigms[cat];
    if (p) return inflect(form, p);
  }
  return form;
}

function arrange(
  order: Language["grammar"]["wordOrder"],
  S: string,
  V: string,
  O: string,
): { first: string; second: string; third: string } {
  const map = {
    SOV: { first: S, second: O, third: V },
    SVO: { first: S, second: V, third: O },
    VSO: { first: V, second: S, third: O },
    VOS: { first: V, second: O, third: S },
    OVS: { first: O, second: V, third: S },
    OSV: { first: O, second: S, third: V },
  } as const;
  return map[order];
}

export interface NarrativeLine {
  gloss: string;
  text: string;
}

function realizeSkeleton(
  lang: Language,
  skeleton: Skeleton,
  script: DisplayScript,
): NarrativeLine | null {
  const pattern = SENTENCE_PATTERNS[skeleton.patternIdx]!;
  const subjectMeaning = resolveMeaning(lang, skeleton.subjectNoun, NOUN_POOL);
  const verbMeaning = resolveMeaning(lang, skeleton.verb, VERB_POOL);
  if (!subjectMeaning || !verbMeaning) return null;
  const objectMeaning = pattern.needsObject
    ? resolveMeaning(lang, skeleton.objectNoun, NOUN_POOL) ?? subjectMeaning
    : subjectMeaning;
  const adjectiveMeaning =
    pattern.needsAdj && skeleton.adjective
      ? resolveMeaning(lang, skeleton.adjective, ADJECTIVE_POOL)
      : null;

  const sForm = lang.lexicon[subjectMeaning];
  const vForm = lang.lexicon[verbMeaning];
  const oForm = lang.lexicon[objectMeaning];
  if (!sForm || !vForm || !oForm) return null;

  const render = (form: WordForm): string =>
    script === "ipa" ? formToString(form) : formatForm(form, lang, script);

  const S = render(inflectNoun(sForm, lang, "S"));
  const V = render(inflectVerb(vForm, lang));
  const O = render(inflectNoun(oForm, lang, "O"));
  const arranged = arrange(lang.grammar.wordOrder, S, V, O);

  if (pattern.needsObject && pattern.needsAdj && adjectiveMeaning) {
    const adjForm = lang.lexicon[adjectiveMeaning];
    if (!adjForm) return null;
    const A = render(adjForm);
    return {
      text: `${arranged.first} ${arranged.second} ${arranged.third} · ${A}`,
      gloss: `[${subjectMeaning}—${verbMeaning}—${adjectiveMeaning} ${objectMeaning}]`,
    };
  }
  if (pattern.needsObject) {
    return {
      text: `${arranged.first} ${arranged.second} ${arranged.third}`,
      gloss: `[${subjectMeaning}—${verbMeaning}—${objectMeaning}]`,
    };
  }
  if (pattern.needsAdj && adjectiveMeaning) {
    const adjForm = lang.lexicon[adjectiveMeaning];
    if (!adjForm) return null;
    const A = render(adjForm);
    return {
      text: `${A} ${S} ${V}`,
      gloss: `[${adjectiveMeaning} ${subjectMeaning}—${verbMeaning}]`,
    };
  }
  return {
    text: `${S} ${V}`,
    gloss: `[${subjectMeaning}—${verbMeaning}]`,
  };
}

/**
 * Produce a short narrative. Pass the same `seedStr` to two languages
 * in compare mode and the two outputs share their skeleton — same
 * sentence patterns, same meaning slots — with only the realized
 * forms varying per language.
 */
export function generateNarrative(
  lang: Language,
  seedStr: string,
  lines = 5,
  script: DisplayScript = "ipa",
): NarrativeLine[] {
  const skeletons = planSkeleton(seedStr, lines);
  const out: NarrativeLine[] = [];
  for (const skel of skeletons) {
    const line = realizeSkeleton(lang, skel, script);
    if (line) out.push(line);
  }
  return out;
}
