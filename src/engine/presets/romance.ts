import type { SimulationConfig, Lexicon, Meaning } from "../types";
import type { Morphology } from "../morphology/types";
import { defaultConfig } from "../config";

const LEXICON: Lexicon = {
  water: ["a", "k", "w", "a"],
  fire: ["f", "o", "k", "u"],
  stone: ["p", "e", "t", "r", "a"],
  earth: ["t", "e", "r", "r", "a"],
  sky: ["k", "a", "i", "l", "u"],
  sun: ["s", "o", "l", "e"],
  moon: ["l", "u", "n", "a"],
  star: ["s", "t", "e", "l", "l", "a"],
  cloud: ["n", "u", "b", "e"],
  rain: ["p", "l", "u", "v", "j", "a"],
  snow: ["n", "i", "v", "e"],
  ice: ["g", "l", "a", "k", "j", "e"],
  wind: ["v", "e", "n", "t", "u"],
  thunder: ["t", "o", "n", "i", "t", "r", "u"],
  lightning: ["f", "u", "l", "g", "u", "r", "e"],
  river: ["f", "l", "u", "m", "e"],
  sea: ["m", "a", "r", "e"],
  lake: ["l", "a", "k", "u"],
  mountain: ["m", "o", "n", "t", "e"],
  hill: ["k", "o", "l", "l", "e"],
  valley: ["v", "a", "l", "l", "e"],
  forest: ["s", "i", "l", "v", "a"],
  field: ["k", "a", "m", "p", "u"],
  road: ["v", "i", "a"],
  path: ["s", "e", "m", "i", "t", "a"],
  day: ["d", "i", "e"],
  night: ["n", "o", "k", "t", "e"],
  morning: ["m", "a", "n", "e"],
  evening: ["s", "e", "r", "a"],
  year: ["a", "n", "n", "u"],
  season: ["t", "e", "m", "p", "u", "s"],
  winter: ["i", "v", "e", "r", "n", "u"],
  summer: ["s", "t", "a", "t", "e"],
  time: ["t", "e", "m", "p", "u"],
  tree: ["a", "r", "b", "o", "r", "e"],
  wood: ["l", "i", "g", "n", "u"],
  leaf: ["f", "o", "l", "j", "a"],
  flower: ["f", "l", "o", "r", "e"],
  grass: ["e", "r", "b", "a"],
  root: ["r", "a", "d", "i", "k", "e"],
  seed: ["s", "e", "m", "e", "n"],
  fruit: ["f", "r", "u", "k", "t", "u"],
  grain: ["g", "r", "a", "n", "u"],
  bark: ["k", "o", "r", "t", "i", "k", "e"],
  oak: ["k", "w", "e", "r", "k", "u"],
  birch: ["b", "e", "t", "u", "l", "a"],
  apple: ["m", "e", "l", "a"],
  dog: ["k", "a", "n", "e"],
  wolf: ["l", "u", "p", "u"],
  horse: ["k", "a", "b", "a", "l", "l", "u"],
  cow: ["v", "a", "k", "k", "a"],
  bull: ["t", "a", "u", "r", "u"],
  sheep: ["o", "v", "e", "k", "u", "l", "a"],
  goat: ["k", "a", "p", "r", "a"],
  pig: ["p", "o", "r", "k", "u"],
  bear: ["u", "r", "s", "u"],
  deer: ["k", "e", "r", "v", "u"],
  fish: ["p", "i", "s", "k", "e"],
  bird: ["a", "v", "i", "k", "e", "l", "l", "u"],
  eagle: ["a", "k", "w", "i", "l", "a"],
  snake: ["s", "e", "r", "p", "e", "n", "t", "e"],
  worm: ["v", "e", "r", "m", "e"],
  louse: ["p", "e", "d", "u", "k", "u"],
  bee: ["a", "p", "i", "k", "u", "l", "a"],
  egg: ["o", "v", "u"],
  feather: ["p", "e", "n", "n", "a"],
  wing: ["a", "l", "a"],
  horn: ["k", "o", "r", "n", "u"],
  tail: ["k", "a", "u", "d", "a"],
  body: ["k", "o", "r", "p", "u", "s"],
  head: ["k", "a", "p", "u", "t"],
  hair: ["k", "a", "p", "i", "l", "l", "u"],
  face: ["f", "a", "k", "j", "e"],
  eye: ["o", "k", "u", "l", "u"],
  ear: ["a", "u", "r", "i", "k", "u", "l", "a"],
  nose: ["n", "a", "s", "u"],
  mouth: ["b", "o", "k", "k", "a"],
  tooth: ["d", "e", "n", "t", "e"],
  tongue: ["l", "i", "n", "g", "w", "a"],
  lip: ["l", "a", "b", "j", "u"],
  neck: ["k", "o", "l", "l", "u"],
  shoulder: ["s", "p", "a", "t", "u", "l", "a"],
  arm: ["b", "r", "a", "k", "j", "u"],
  hand: ["m", "a", "n", "u"],
  finger: ["d", "i", "g", "i", "t", "u"],
  nail: ["u", "n", "g", "u", "l", "a"],
  chest: ["p", "e", "k", "t", "u", "s"],
  back: ["d", "o", "r", "s", "u"],
  belly: ["v", "e", "n", "t", "r", "e"],
  heart: ["k", "o", "r"],
  liver: ["f", "i", "k", "a", "t", "u"],
  lung: ["p", "u", "l", "m", "o", "n", "e"],
  bone: ["o", "s", "s", "u"],
  blood: ["s", "a", "n", "g", "w", "e"],
  skin: ["p", "e", "l", "l", "e"],
  flesh: ["k", "a", "r", "n", "e"],
  knee: ["g", "e", "n", "u", "k", "u", "l", "u"],
  leg: ["g", "a", "m", "b", "a"],
  foot: ["p", "e", "d", "e"],
  person: ["p", "e", "r", "s", "o", "n", "a"],
  man: ["o", "m", "i", "n", "e"],
  woman: ["m", "u", "l", "j", "e", "r", "e"],
  child: ["i", "n", "f", "a", "n", "t", "e"],
  baby: ["i", "n", "f", "a", "n", "t", "e"],
  mother: ["m", "a", "t", "r", "e"],
  father: ["p", "a", "t", "r", "e"],
  son: ["f", "i", "l", "j", "u"],
  daughter: ["f", "i", "l", "j", "a"],
  brother: ["f", "r", "a", "t", "r", "e"],
  sister: ["s", "o", "r", "o", "r", "e"],
  husband: ["m", "a", "r", "i", "t", "u"],
  wife: ["s", "p", "o", "n", "s", "a"],
  king: ["r", "e", "g", "e"],
  god: ["d", "e", "u"],
  guest: ["o", "s", "p", "e", "t", "e"],
  enemy: ["i", "n", "i", "m", "i", "k", "u"],
  house: ["k", "a", "s", "a"],
  door: ["p", "o", "r", "t", "a"],
  hearth: ["f", "o", "k", "u"],
  yoke: ["j", "u", "g", "u"],
  wheel: ["r", "o", "t", "a"],
  boat: ["b", "a", "r", "k", "a"],
  ship: ["n", "a", "v", "e"],
  knife: ["k", "u", "l", "t", "e", "l", "l", "u"],
  axe: ["s", "e", "k", "u", "r", "e"],
  spear: ["l", "a", "n", "k", "j", "a"],
  bow: ["a", "r", "k", "u"],
  arrow: ["s", "a", "g", "i", "t", "t", "a"],
  rope: ["k", "o", "r", "d", "a"],
  cloth: ["v", "e", "s", "t", "e"],
  wool: ["l", "a", "n", "a"],
  bread: ["p", "a", "n", "e"],
  meat: ["k", "a", "r", "n", "e"],
  milk: ["l", "a", "k", "t", "e"],
  honey: ["m", "e", "l", "e"],
  salt: ["s", "a", "l", "e"],
  wine: ["v", "i", "n", "u"],
  oil: ["o", "l", "j", "u"],
  be: ["e", "s", "s", "e", "r", "e"],
  go: ["i", "r"],
  come: ["v", "e", "n", "i", "r", "e"],
  walk: ["a", "m", "b", "u", "l", "a", "r", "e"],
  run: ["k", "u", "r", "r", "e", "r", "e"],
  stand: ["s", "t", "a", "r", "e"],
  sit: ["s", "e", "d", "e", "r", "e"],
  lie: ["j", "a", "k", "e", "r", "e"],
  fall: ["k", "a", "d", "e", "r", "e"],
  fly: ["v", "o", "l", "a", "r", "e"],
  swim: ["n", "a", "t", "a", "r", "e"],
  see: ["v", "i", "d", "e", "r", "e"],
  hear: ["a", "u", "d", "i", "r", "e"],
  know: ["s", "k", "i", "r", "e"],
  think: ["k", "o", "g", "i", "t", "a", "r", "e"],
  speak: ["p", "a", "r", "a", "b", "o", "l", "a", "r", "e"],
  say: ["d", "i", "k", "e", "r", "e"],
  call: ["k", "l", "a", "m", "a", "r", "e"],
  ask: ["r", "o", "g", "a", "r", "e"],
  do: ["f", "a", "k", "e", "r", "e"],
  make: ["f", "a", "k", "e", "r", "e"],
  take: ["p", "r", "e", "n", "d", "e", "r", "e"],
  give: ["d", "a", "r", "e"],
  hold: ["t", "e", "n", "e", "r", "e"],
  carry: ["p", "o", "r", "t", "a", "r", "e"],
  throw: ["j", "a", "k", "t", "a", "r", "e"],
  pull: ["t", "i", "r", "a", "r", "e"],
  push: ["p", "u", "l", "s", "a", "r", "e"],
  cut: ["t", "a", "l", "j", "a", "r", "e"],
  break: ["r", "u", "m", "p", "e", "r", "e"],
  bend: ["p", "l", "i", "k", "a", "r", "e"],
  build: ["k", "o", "n", "s", "t", "r", "u", "e", "r", "e"],
  burn: ["u", "r", "e", "r", "e"],
  wash: ["l", "a", "v", "a", "r", "e"],
  weave: ["t", "e", "k", "s", "e", "r", "e"],
  plant: ["p", "l", "a", "n", "t", "a", "r", "e"],
  eat: ["k", "o", "m", "e", "d", "e", "r", "e"],
  drink: ["b", "i", "b", "e", "r", "e"],
  sleep: ["d", "o", "r", "m", "i", "r", "e"],
  dream: ["s", "o", "m", "n", "j", "a", "r", "e"],
  live: ["v", "i", "v", "e", "r", "e"],
  die: ["m", "o", "r", "i", "r", "e"],
  bear_child: ["p", "a", "r", "e", "r", "e"],
  grow: ["k", "r", "e", "s", "k", "e", "r", "e"],
  love: ["a", "m", "a", "r", "e"],
  fear: ["t", "i", "m", "e", "r", "e"],
  laugh: ["r", "i", "d", "e", "r", "e"],
  cry: ["p", "l", "o", "r", "a", "r", "e"],
  one: ["u", "n", "u"],
  two: ["d", "u", "o"],
  three: ["t", "r", "e", "s"],
  four: ["k", "w", "a", "t", "t", "o", "r"],
  five: ["k", "w", "i", "n", "k", "w", "e"],
  six: ["s", "e", "k", "s"],
  seven: ["s", "e", "p", "t", "e"],
  eight: ["o", "k", "t", "o"],
  nine: ["n", "o", "v", "e"],
  ten: ["d", "e", "k", "e"],
  hundred: ["k", "e", "n", "t", "u"],
  big: ["g", "r", "a", "n", "d", "e"],
  small: ["p", "i", "k", "k", "u", "l", "u"],
  long: ["l", "o", "n", "g", "u"],
  short: ["b", "r", "e", "v", "e"],
  tall: ["a", "l", "t", "u"],
  wide: ["l", "a", "r", "g", "u"],
  thick: ["k", "r", "a", "s", "s", "u"],
  thin: ["t", "e", "n", "u", "j", "u"],
  heavy: ["g", "r", "e", "v", "e"],
  light: ["l", "e", "v", "e"],
  hot: ["k", "a", "l", "d", "u"],
  cold: ["f", "r", "i", "g", "i", "d", "u"],
  wet: ["u", "m", "i", "d", "u"],
  dry: ["s", "i", "k", "k", "u"],
  full: ["p", "l", "e", "n", "u"],
  empty: ["v", "a", "k", "u", "u"],
  new: ["n", "o", "v", "u"],
  old: ["v", "e", "t", "u", "l", "u"],
  young: ["j", "u", "v", "e", "n", "e"],
  good: ["b", "o", "n", "u"],
  bad: ["m", "a", "l", "u"],
  sweet: ["d", "u", "l", "k", "j", "u"],
  bitter: ["a", "m", "a", "r", "u"],
  strong: ["f", "o", "r", "t", "e"],
  weak: ["d", "e", "b", "i", "l", "e"],
  fast: ["k", "i", "t", "u"],
  slow: ["l", "e", "n", "t", "u"],
  red: ["r", "u", "b", "j", "u"],
  black: ["n", "i", "g", "r", "u"],
  white: ["b", "l", "a", "n", "k", "u"],
  green: ["v", "i", "r", "i", "d", "e"],
  yellow: ["g", "a", "l", "b", "u"],
  blue: ["k", "a", "e", "r", "u", "l", "u"],
  name: ["n", "o", "m", "e", "n"],
  word: ["v", "e", "r", "b", "u"],
  truth: ["v", "e", "r", "i", "t", "a", "t", "e"],
  this: ["i", "s", "t", "u"],
  that: ["i", "l", "l", "u"],
  here: ["k", "i"],
  there: ["i", "b", "i"],
  i: ["e", "g", "o"],
  you: ["t", "u"],
  we: ["n", "o", "s"],
  they: ["i", "l", "l", "i"],
  he: ["i", "l", "l", "u"],
  she: ["i", "l", "l", "a"],
  it: ["i", "l", "l", "u", "d"],
  the: ["i", "l", "l", "u"],
  a: ["u", "n"],
  and: ["e", "t"],
  or: ["a", "u", "t"],
  not: ["n", "o", "n"],
  in: ["i", "n"],
  on: ["s", "u", "p", "r", "a"],
  to: ["a", "d"],
  for: ["p", "r", "o"],
  by: ["p", "e", "r"],
  // Phase 36 Tranche 36n: Latin derivational morphemes. -tor agentive
  // (factor, doctor); -tio nominalisation (actio, passio); -tas abstract
  // (libertas, veritas); -arius adjectival agentive (sicarius); -ulus
  // diminutive (parvulus). Seeded as bound morphemes; flow through
  // sound change to /-tre/, /-zone/, /-tat/, /-aire/, /-uolo/ in
  // Romance daughters.
  "-tor.agt": ["t", "o", "r"],
  "-tio.nmlz": ["t", "i", "o"],
  "-tas.abs": ["t", "a", "s"],
  "-arius.agt": ["a", "r", "i", "u", "s"],
  "-ulus.dim": ["u", "l", "u", "s"],
};

const ROMANCE_BOUND_MORPHEMES = new Set<string>([
  "-tor.agt", "-tio.nmlz", "-tas.abs", "-arius.agt", "-ulus.dim",
]);

// Phase 29 Tranche 5s: deepened from ~33 to ~80 entries to catch the
// frequency-direction split (Phase 24c) for the Romance lexicon. Pre-
// fix the bulk of meanings defaulted to 0.5 — no high/low signal —
// so high-freq content words drifted at the same rate as rare ones,
// muting Romance's actual diachrony (very-high-freq esse/ire/posse/
// vidēre persist while mid-freq words erode).
const FREQ: Record<Meaning, number> = {
  // Pronouns + closed-class
  i: 0.99, you: 0.99, we: 0.97, they: 0.95, he: 0.96, she: 0.96, it: 0.95,
  this: 0.96, that: 0.96, here: 0.92, there: 0.92,
  not: 0.97, and: 0.98, or: 0.93,
  // Most-frequent verbs
  be: 0.98, have: 0.97, do: 0.95, go: 0.96, come: 0.95,
  see: 0.94, say: 0.94, know: 0.93, give: 0.92, take: 0.92,
  make: 0.93, find: 0.88, want: 0.93, eat: 0.95, drink: 0.94,
  walk: 0.85, run: 0.85, sit: 0.83, stand: 0.85, sleep: 0.88,
  hear: 0.88, speak: 0.88, think: 0.9,
  // Kinship + body — high persistence
  mother: 0.92, father: 0.92, child: 0.9, brother: 0.85, sister: 0.85,
  hand: 0.89, foot: 0.89, eye: 0.9, head: 0.85, mouth: 0.85,
  ear: 0.83, nose: 0.83, heart: 0.85, blood: 0.85,
  // Numerals
  one: 0.97, two: 0.94, three: 0.92, four: 0.86, five: 0.86,
  // Very common nouns
  water: 0.95, fire: 0.85, day: 0.92, night: 0.92, sun: 0.88, moon: 0.85,
  earth: 0.84, sky: 0.84, star: 0.78, tree: 0.83, stone: 0.83,
  bread: 0.85, wine: 0.82, food: 0.85, house: 0.88, road: 0.78,
  // Adjectives
  big: 0.9, small: 0.9, good: 0.92, bad: 0.85, new: 0.83, old: 0.83,
  long: 0.78, short: 0.74, hot: 0.75, cold: 0.75,
  // Mid-low frequency content words (will erode faster)
  shoulder: 0.5, navel: 0.45, scale: 0.4, claw: 0.42, fin: 0.4,
  thunder: 0.55, lightning: 0.5, hill: 0.5, valley: 0.5,
};

const MORPHOLOGY: Morphology = {
  paradigms: {
    "noun.case.nom": { affix: ["u", "s"], position: "suffix", category: "noun.case.nom" },
    "noun.case.acc": { affix: ["u", "m"], position: "suffix", category: "noun.case.acc" },
    "noun.case.gen": { affix: ["i"], position: "suffix", category: "noun.case.gen" },
    "noun.case.dat": { affix: ["o"], position: "suffix", category: "noun.case.dat" },
    "noun.case.abl": { affix: ["o"], position: "suffix", category: "noun.case.abl" },
    "noun.num.pl": { affix: ["i"], position: "suffix", category: "noun.num.pl" },
    "verb.tense.past": { affix: ["a", "v", "i"], position: "suffix", category: "verb.tense.past" },
    "verb.tense.fut": { affix: ["a", "b", "o"], position: "suffix", category: "verb.tense.fut" },
    "verb.aspect.pfv": { affix: ["a", "v", "i"], position: "suffix", category: "verb.aspect.pfv" },
    "verb.person.1sg": { affix: ["o"], position: "suffix", category: "verb.person.1sg" },
    "verb.person.2sg": { affix: ["s"], position: "suffix", category: "verb.person.2sg" },
    "verb.person.3sg": { affix: ["t"], position: "suffix", category: "verb.person.3sg" },
    // Phase 26a: full Romance-style 6-form conjugation. The simulator's
    // realiseVerb (translator/realise.ts:535) already pushes the right
    // verb.person.{ps}{ns} category when the paradigm exists; previously
    // only sg variants were seeded so 1pl/2pl/3pl silently fell back to
    // null inflection. Now Spanish-style multi-form conjugation is
    // possible: speak + 1pl → speakmus, + 2pl → speaktis, + 3pl → speaknt.
    "verb.person.1pl": { affix: ["m", "u", "s"], position: "suffix", category: "verb.person.1pl" },
    "verb.person.2pl": { affix: ["t", "i", "s"], position: "suffix", category: "verb.person.2pl" },
    "verb.person.3pl": { affix: ["n", "t"], position: "suffix", category: "verb.person.3pl" },
  },
};

/**
 * Phase 20e-2: Vulgar Latin / Proto-Romance suppletion fragments.
 *
 * The suppletive verb pair *esse / *fui* (be / was), the irregular
 * *ire / *vāde-* (go / went), the Latin comparative pair bonus/melior
 * and malus/peior, the famous homo/homines stem alternation. These
 * forms feed straight into early Romance daughters when the simulator
 * descends from this preset.
 */
const SUPPLETION: NonNullable<import("../types").Language["suppletion"]> = {
  // *esse* "be" → perfect *fui*
  be: { "verb.tense.past": ["f", "u", "i"] },
  // *ire* "go" → perfect *ii* / present *vāde-* (the suppletion that
  // gives Romance va/vu vs. ire descendants)
  go: { "verb.tense.past": ["i", "i"] },
  // *vidēre* "see" → perfect *vidi*
  see: { "verb.tense.past": ["v", "i", "d", "i"] },
  // *facere* "make/do" → perfect *fēci* (we use the eat slot since
  // make isn't in the Romance seedLexicon)
  // Comparative degree
  good: { "adj.degree.cmp": ["m", "e", "l", "j", "o", "r", "e"] },
  bad: { "adj.degree.cmp": ["p", "e", "j", "o", "r", "e"] },
  // homo/homines: nominative singular vs. plural stem alternation
  man: { "noun.num.pl": ["o", "m", "i", "n", "e", "s"] },
};

export function presetRomance(): SimulationConfig {
  const base = defaultConfig();
  return {
    ...base,
    seed: "romance",
    seedLexicon: LEXICON,
    seedFrequencyHints: FREQ,
    seedMorphology: MORPHOLOGY,
    seedSuppletion: SUPPLETION,
    seedCulturalTier: 2,
    seedStressPattern: "penult",
    // Phase 26b: Romance infinitive = -re affix suffix (Latin amāre, Spanish amar/comer/vivir).
    seedInfinitiveStrategy: { kind: "affix-suffix", affix: ["r", "e"] },
    // Phase 27a: Romance prefers (C)CVC (Latin amare, Spanish hablar);
    // moderate strictness biases against complex onsets/codas.
    seedPhonotacticProfile: {
      maxOnset: 2,
      maxCoda: 2,
      maxCluster: 3,
      strictness: 0.7,
    },
    seedGrammar: {
      // Phase 29 Tranche 5s: corrected adjectivePosition to "pre".
      // Phase 30 Tranche 30d: articlePresence: "none". Latin had no
      // definite article; ille/illa grammaticalised into Romance
      // daughters' articles centuries later. Drift pathway can
      // re-introduce articles via grammaticalize step.
      wordOrder: "SVO",
      articlePresence: "none",
      caseStrategy: "case",
      adjectivePosition: "pre",
      possessorPosition: "post",
      // Phase 35 Tranche 35c/d/e: Latin had three-way demonstrative
      // (hic/iste/ille), sg-pl number, and rich aspect (perfective
      // / imperfective opposition pervasive in the verbal system).
      demonstrativeDistance: "three-way",
      numberSystem: "sg-pl",
      aspectSystem: "pfv-ipfv",
      // Latin perfect was synthetic (amavit), but the
      // post-Classical "habere + past participle" periphrasis
      // started spreading. Seed synthetic; daughters can flip.
      perfectRealisation: "synthetic",
      // Phase 36 Tranche 36e: Latin/Romance subjunctive in subordinate
      // clauses ("quiero que venga", "veuille qu'il vienne").
      moodMarking: "subjunctive",
      // Phase 36 Tranche 36k: Romance languages have T-V (tu/vous,
      // tú/usted, tu/Lei). Seed at the proto so daughters inherit.
      politenessRegister: "T-V",
    },
    // Phase 31 Tranche 31d: Latin non-tonal.
    seedToneRegime: "non-tonal",
    seedBoundMorphemes: ROMANCE_BOUND_MORPHEMES,
    preset: "romance",
  };
}
