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
  // kinship
  "mother", "father", "child", "brother", "sister", "friend",
  // animals
  "dog", "wolf", "horse", "cow", "bird", "fish", "snake", "bear",
  // body
  "hand", "foot", "eye", "head", "heart",
  // environment
  "tree", "water", "fire", "stone", "moon", "sun", "star", "river",
  "mountain", "forest", "wind", "rain",
  // social
  "king", "warrior", "stranger", "village", "house",
] as const;

const VERB_POOL = [
  // motion
  "go", "come", "walk", "run", "fall", "fly",
  // perception
  "see", "know", "hear", "think",
  // metabolism
  "eat", "drink", "sleep", "die",
  // action
  "give", "take", "speak", "hold", "fight", "make", "break",
] as const;

const ADJECTIVE_POOL = [
  "big", "small", "new", "old", "good", "bad",
  "tall", "short", "fast", "slow", "wise", "young",
] as const;

const TIME_POOL = ["morning", "evening", "night", "winter", "summer"] as const;

interface SentencePattern {
  template: string;
  needsObject: boolean;
  needsAdj: boolean;
  /** Time-of-day or season prefix ("In the morning, …"). */
  needsTime?: boolean;
  /** Bare (no English connectives) — usable for any language regardless of grammar. */
  bare?: boolean;
}

const SENTENCE_PATTERNS: SentencePattern[] = [
  // Bare core (work in any preset)
  { template: "The {S} {V} the {O}.",            needsObject: true,  needsAdj: false, bare: true },
  { template: "The {S} {V} the {adj} {O}.",      needsObject: true,  needsAdj: true,  bare: true },
  { template: "The {adj} {S} {V}.",              needsObject: false, needsAdj: true,  bare: true },
  { template: "{S} {V}.",                         needsObject: false, needsAdj: false, bare: true },
  // Embellished — add a time prefix
  { template: "In the {time}, the {S} {V}.",     needsObject: false, needsAdj: false, needsTime: true },
  { template: "In the {time}, the {S} {V} the {O}.", needsObject: true, needsAdj: false, needsTime: true },
  { template: "Long ago, the {S} {V} the {O}.",  needsObject: true,  needsAdj: false },
  // Existential / state
  { template: "The {S} is {adj}.",                needsObject: false, needsAdj: true,  bare: true },
  { template: "The {S} is the {O}.",              needsObject: true,  needsAdj: false, bare: true },
  // Question pattern (declarative answer; the engine renders both as flat)
  { template: "The {S} {V} where the {O} is.",   needsObject: true,  needsAdj: false },
  // Cause-effect
  { template: "The {S} {V}, so the {O} {V}.",    needsObject: true,  needsAdj: false },
  // Possession / kinship
  { template: "The {S}'s {O} {V}.",               needsObject: true,  needsAdj: false, bare: true },
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
  timePhrase: Meaning | null;
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
    const timeCand = pickFromPoolByIndex(TIME_POOL, rng);
    out.push({
      patternIdx,
      subjectNoun: subject,
      verb,
      objectNoun: pattern.needsObject ? objectCand : subject,
      adjective: pattern.needsAdj ? adjCand : null,
      timePhrase: pattern.needsTime ? timeCand : null,
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

function inflectNoun(
  form: WordForm,
  lang: Language,
  role: "S" | "O",
  meaning: string,
): WordForm {
  if (role === "S" && lang.grammar.pluralMarking === "affix") {
    const p = lang.morphology.paradigms["noun.num.pl"];
    if (p) return inflect(form, p, lang, meaning);
  }
  if (role === "O" && lang.grammar.hasCase) {
    const acc = lang.morphology.paradigms["noun.case.acc"];
    if (acc) return inflect(form, acc, lang, meaning);
  }
  return form;
}

function inflectVerb(form: WordForm, lang: Language, meaning: string): WordForm {
  const order: MorphCategory[] = [
    "verb.tense.past",
    "verb.tense.fut",
    "verb.aspect.ipfv",
    "verb.aspect.pfv",
    "verb.person.3sg",
  ];
  for (const cat of order) {
    const p = lang.morphology.paradigms[cat];
    if (p) return inflect(form, p, lang, meaning);
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
  const timeMeaning =
    pattern.needsTime && skeleton.timePhrase
      ? resolveMeaning(lang, skeleton.timePhrase, TIME_POOL)
      : null;

  const sForm = lang.lexicon[subjectMeaning];
  const vForm = lang.lexicon[verbMeaning];
  const oForm = lang.lexicon[objectMeaning];
  if (!sForm || !vForm || !oForm) return null;

  const render = (form: WordForm): string =>
    script === "ipa" ? formToString(form) : formatForm(form, lang, script);

  const S = render(inflectNoun(sForm, lang, "S", subjectMeaning));
  const V = render(inflectVerb(vForm, lang, verbMeaning));
  const O = render(inflectNoun(oForm, lang, "O", objectMeaning));
  const arranged = arrange(lang.grammar.wordOrder, S, V, O);
  const timeForm = timeMeaning ? lang.lexicon[timeMeaning] : null;
  const T = timeForm ? render(timeForm) : "";

  // Time prefix — ":" separator keeps the gloss aligned with the
  // surface order without imposing English connectives.
  const timePrefixText = T ? `${T} · ` : "";
  const timePrefixGloss = timeMeaning ? `[${timeMeaning}] ` : "";

  if (pattern.needsObject && pattern.needsAdj && adjectiveMeaning) {
    const adjForm = lang.lexicon[adjectiveMeaning];
    if (!adjForm) return null;
    const A = render(adjForm);
    return {
      text: `${timePrefixText}${arranged.first} ${arranged.second} ${arranged.third} · ${A}`,
      gloss: `${timePrefixGloss}[${subjectMeaning}—${verbMeaning}—${adjectiveMeaning} ${objectMeaning}]`,
    };
  }
  if (pattern.needsObject) {
    return {
      text: `${timePrefixText}${arranged.first} ${arranged.second} ${arranged.third}`,
      gloss: `${timePrefixGloss}[${subjectMeaning}—${verbMeaning}—${objectMeaning}]`,
    };
  }
  if (pattern.needsAdj && adjectiveMeaning) {
    const adjForm = lang.lexicon[adjectiveMeaning];
    if (!adjForm) return null;
    const A = render(adjForm);
    return {
      text: `${timePrefixText}${A} ${S} ${V}`,
      gloss: `${timePrefixGloss}[${adjectiveMeaning} ${subjectMeaning}—${verbMeaning}]`,
    };
  }
  return {
    text: `${timePrefixText}${S} ${V}`,
    gloss: `${timePrefixGloss}[${subjectMeaning}—${verbMeaning}]`,
  };
}

/**
 * A short, pronounceable random seed for narratives — used by the
 * "🎲 New story" button so the user gets a fresh skeleton without
 * thinking about seed values.
 */
export function randomNarrativeSeed(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
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
