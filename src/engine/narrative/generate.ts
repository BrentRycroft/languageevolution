import type { Language, Meaning, WordForm } from "../types";
import { makeRng, type Rng } from "../rng";
import { formToString } from "../phonology/ipa";
import { formatForm, type DisplayScript } from "../phonology/display";
import { inflect } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";
import { translateSentence } from "../translator/sentence";

const NOUN_POOL = [
  "mother", "father", "child", "brother", "sister", "friend",
  "dog", "wolf", "horse", "cow", "bird", "fish", "snake", "bear",
  "hand", "foot", "eye", "head", "heart",
  "tree", "water", "fire", "stone", "moon", "sun", "star", "river",
  "mountain", "forest", "wind", "rain",
  "king", "warrior", "stranger", "village", "house",
] as const;

const TRANSITIVE_VERBS = [
  "see", "know", "hear", "think",
  "eat", "drink",
  "give", "take", "speak", "hold", "fight", "make", "break",
] as const;
const INTRANSITIVE_VERBS = [
  "go", "come", "walk", "run", "fall", "fly",
  "sleep", "die",
] as const;
const VERB_POOL = [...TRANSITIVE_VERBS, ...INTRANSITIVE_VERBS] as const;

const ADJECTIVE_POOL = [
  "big", "small", "new", "old", "good", "bad",
  "tall", "short", "fast", "slow", "wise", "young",
] as const;

const TIME_POOL = ["morning", "evening", "night", "winter", "summer"] as const;

interface SentencePattern {
  template: string;
  needsObject: boolean;
  needsAdj: boolean;
  needsTime?: boolean;
  bare?: boolean;
}

const SENTENCE_PATTERNS: SentencePattern[] = [
  { template: "The {S} {V} the {O}.",            needsObject: true,  needsAdj: false, bare: true },
  { template: "The {S} {V} the {adj} {O}.",      needsObject: true,  needsAdj: true,  bare: true },
  { template: "The {adj} {S} {V}.",              needsObject: false, needsAdj: true,  bare: true },
  { template: "{S} {V}.",                         needsObject: false, needsAdj: false, bare: true },
  { template: "In the {time}, the {S} {V}.",     needsObject: false, needsAdj: false, needsTime: true },
  { template: "In the {time}, the {S} {V} the {O}.", needsObject: true, needsAdj: false, needsTime: true },
  { template: "Long ago, the {S} {V} the {O}.",  needsObject: true,  needsAdj: false },
  { template: "The {S} is {adj}.",                needsObject: false, needsAdj: true,  bare: true },
  { template: "The {S} is the {O}.",              needsObject: true,  needsAdj: false, bare: true },
  { template: "The {S} {V} where the {O} is.",   needsObject: true,  needsAdj: false },
  { template: "The {S} {V}, so the {O} {V}.",    needsObject: true,  needsAdj: false },
  { template: "The {S}'s {O} {V}.",               needsObject: true,  needsAdj: false, bare: true },
];

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
  const rng = makeRng(`narrative:${seedStr}:${lines}`);
  const out: Skeleton[] = [];
  for (let i = 0; i < lines; i++) {
    const patternIdx = rng.int(SENTENCE_PATTERNS.length);
    const pattern = SENTENCE_PATTERNS[patternIdx]!;
    const subject = pickFromPoolByIndex(NOUN_POOL, rng);
    const verbPool = pattern.needsObject ? TRANSITIVE_VERBS : VERB_POOL;
    const verb = pickFromPoolByIndex(verbPool, rng);
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

function usesDeepRouting(lang: Language): boolean {
  const g = lang.grammar;
  return !!(
    g.alignment && g.alignment !== "nom-acc"
    || g.harmony && g.harmony !== "none"
    || g.classifierSystem
    || (g.evidentialMarking && g.evidentialMarking !== "none")
    || g.relativeClauseStrategy
    || g.serialVerbConstructions
    || (g.politenessRegister && g.politenessRegister !== "none")
  );
}

function buildEnglishSentence(
  pattern: SentencePattern,
  subject: string,
  verb: string,
  object: string,
  adjective: string | null,
  time: string | null,
): string {
  let s = pattern.template;
  s = s.replace("{S}", subject);
  s = s.replace("{V}", verb);
  s = s.replace("{O}", object);
  if (adjective) s = s.replace("{adj}", adjective);
  if (time) s = s.replace("{time}", time);
  s = s.replace(/\.$/, "");
  return s.trim();
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

  if (usesDeepRouting(lang)) {
    const englishStr = buildEnglishSentence(
      pattern,
      subjectMeaning,
      verbMeaning,
      objectMeaning,
      adjectiveMeaning,
      timeMeaning,
    );
    const translated = translateSentence(lang, englishStr);
    if (translated.targetTokens.length > 0) {
      const text = translated.targetTokens
        .map((t) => {
          if (t.targetForm.length === 0) return t.targetSurface;
          return script === "ipa"
            ? formToString(t.targetForm)
            : formatForm(t.targetForm, lang, script, t.englishLemma);
        })
        .join(" ");
      const glossParts = translated.targetTokens
        .map((t) => t.englishLemma)
        .filter((l) => l && l !== "?");
      const timePrefixGlossLocal = timeMeaning ? `[${timeMeaning}] ` : "";
      return {
        text,
        gloss: `${timePrefixGlossLocal}[${glossParts.join("—")}]`,
      };
    }
  }

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

export function randomNarrativeSeed(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

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
