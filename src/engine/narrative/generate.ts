import type { Language, Meaning, WordForm } from "../types";
import { makeRng, type Rng } from "../rng";
import { formToString } from "../phonology/ipa";
import { formatForm, type DisplayScript } from "../phonology/display";
import { inflect } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";

/**
 * Sentence templates work against placeholder roles the language must be able
 * to fill — nouns from the body / animals / kinship clusters; verbs from
 * motion / metabolism; adjectives from the evaluation cluster.
 *
 * Order of constituents is rearranged according to the language's current
 * word order (SOV / SVO / VSO / ...).
 */
interface Sentence {
  subjectNoun: Meaning;
  verb: Meaning;
  objectNoun: Meaning;
  adjective?: Meaning;
}

const NOUN_POOL = [
  "mother", "father", "dog", "wolf", "horse", "cow", "bird", "fish",
  "hand", "foot", "tree", "water", "fire", "stone", "moon", "sun",
] as const;

const VERB_POOL = ["go", "come", "see", "know", "eat", "drink", "sleep", "die"] as const;

const ADJECTIVE_POOL = ["big", "small", "new", "old", "good", "bad"] as const;

const SENTENCE_PATTERNS: Array<{ template: string; needsObject: boolean; needsAdj: boolean }> = [
  { template: "The {adj} {S} {V}.", needsObject: false, needsAdj: true },
  { template: "The {S} {V} the {O}.", needsObject: true, needsAdj: false },
  { template: "The {S} {V} the {adj} {O}.", needsObject: true, needsAdj: true },
  { template: "{S} {V}.", needsObject: false, needsAdj: false },
];

/**
 * Pick a meaning from `pool` that the language actually has a form for.
 * Falls back to any available meaning from the pool, or to any lexeme at all.
 */
function pickFromPool(lang: Language, pool: readonly string[], rng: Rng): Meaning | null {
  const available = pool.filter((m) => lang.lexicon[m]);
  if (available.length > 0) return available[rng.int(available.length)]!;
  // Pool missing; fall back to any noun-like meaning in the lexicon.
  const all = Object.keys(lang.lexicon).filter((m) => !m.includes("-"));
  if (all.length > 0) return all[rng.int(all.length)]!;
  return null;
}

function pickSentence(lang: Language, rng: Rng): Sentence | null {
  const pattern = SENTENCE_PATTERNS[rng.int(SENTENCE_PATTERNS.length)]!;
  const subject = pickFromPool(lang, NOUN_POOL, rng);
  const verb = pickFromPool(lang, VERB_POOL, rng);
  if (!subject || !verb) return null;
  const object = pattern.needsObject ? pickFromPool(lang, NOUN_POOL, rng) : null;
  const adjective = pattern.needsAdj ? pickFromPool(lang, ADJECTIVE_POOL, rng) : null;
  return {
    subjectNoun: subject,
    verb,
    objectNoun: object ?? subject,
    adjective: adjective ?? undefined,
  };
}

/**
 * Apply the language's paradigms to give a noun a plural form and a verb
 * a tense suffix. Keeps it simple: past-tense affix if the grammar has one,
 * otherwise bare stem. Plural marking applied to the subject when the
 * language has that paradigm.
 */
function inflectNoun(form: WordForm, lang: Language, role: "S" | "O"): WordForm {
  if (role === "S" && lang.grammar.pluralMarking === "affix") {
    const p = lang.morphology.paradigms["noun.num.pl"];
    if (p) return inflect(form, p);
  }
  // Case inflection on the object if the language has cases.
  if (role === "O" && lang.grammar.hasCase) {
    const acc = lang.morphology.paradigms["noun.case.acc"];
    if (acc) return inflect(form, acc);
  }
  return form;
}

function inflectVerb(form: WordForm, lang: Language): WordForm {
  // Prefer past > future > imperfective > perfective > 3sg.
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

/**
 * Reorder the three surface constituents according to the language's word
 * order. We always emit them in lowercase IPA; the template just stitches
 * them together with any fixed bits (like "the").
 */
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

/**
 * Produce a short narrative as lines. Each line includes the rendered
 * word-forms in the caller's chosen script (default IPA, can be Roman
 * orthography or both) and an English gloss in square brackets showing
 * the meanings used.
 */
export function generateNarrative(
  lang: Language,
  seedStr: string,
  lines = 5,
  script: DisplayScript = "ipa",
): NarrativeLine[] {
  const rng = makeRng(seedStr + ":" + lang.id + ":" + lang.birthGeneration);
  const out: NarrativeLine[] = [];
  const render = (form: WordForm): string =>
    script === "ipa" ? formToString(form) : formatForm(form, lang, script);
  for (let i = 0; i < lines; i++) {
    const sentence = pickSentence(lang, rng);
    if (!sentence) break;
    const sForm = lang.lexicon[sentence.subjectNoun];
    const vForm = lang.lexicon[sentence.verb];
    const oForm = lang.lexicon[sentence.objectNoun];
    if (!sForm || !vForm || !oForm) continue;
    const S = render(inflectNoun(sForm, lang, "S"));
    const V = render(inflectVerb(vForm, lang));
    const O = render(inflectNoun(oForm, lang, "O"));
    const arranged = arrange(lang.grammar.wordOrder, S, V, O);

    // Distinct templates produce different surface strings.
    const patternIdx = rng.int(SENTENCE_PATTERNS.length);
    const pattern = SENTENCE_PATTERNS[patternIdx]!;
    let text: string;
    let gloss: string;
    if (pattern.needsObject && pattern.needsAdj && sentence.adjective) {
      const adjForm = lang.lexicon[sentence.adjective];
      if (!adjForm) continue;
      const A = render(adjForm);
      text = `${arranged.first} ${arranged.second} ${arranged.third} · ${A}`;
      gloss = `[${sentence.subjectNoun}—${sentence.verb}—${sentence.adjective} ${sentence.objectNoun}]`;
    } else if (pattern.needsObject) {
      text = `${arranged.first} ${arranged.second} ${arranged.third}`;
      gloss = `[${sentence.subjectNoun}—${sentence.verb}—${sentence.objectNoun}]`;
    } else if (pattern.needsAdj && sentence.adjective) {
      const adjForm = lang.lexicon[sentence.adjective];
      if (!adjForm) continue;
      const A = render(adjForm);
      text = `${A} ${S} ${V}`;
      gloss = `[${sentence.adjective} ${sentence.subjectNoun}—${sentence.verb}]`;
    } else {
      text = `${S} ${V}`;
      gloss = `[${sentence.subjectNoun}—${sentence.verb}]`;
    }
    out.push({ gloss, text });
  }
  return out;
}
