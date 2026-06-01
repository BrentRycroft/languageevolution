import type { SimulationConfig, Lexicon, Meaning } from "../types";
import type { Morphology } from "../morphology/types";
import { defaultConfig } from "../config";

/**
 * bantu.ts
 *
 * Built-in language seeds (PIE, Germanic, Romance, Bantu, Toki Pona, English). Key exports: presetBantu.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const LEXICON: Lexicon = {
  water: ["m", "a", "ɲ", "i"],
  fire: ["m", "u", "l", "i", "l", "o"],
  stone: ["b", "u", "e˩"],
  earth: ["i", "t", "a", "k", "a"],
  sky: ["i", "g", "u˥", "l", "u"],
  sun: ["i", "j", "u", "b", "a"],
  moon: ["m", "w", "e˩", "z", "i"],
  star: ["ɲ", "e", "n", "j", "e", "z", "i"],
  cloud: ["i", "k", "u˥", "m", "b", "i"],
  rain: ["m", "v", "u˥", "l", "a"],
  wind: ["m", "u", "p", "e", "p", "o"],
  thunder: ["i", "k", "u˥", "p", "u", "g", "u"],
  river: ["m", "u", "k", "o"],
  sea: ["i", "j", "i", "d", "a"],
  lake: ["i", "z", "i", "w", "a"],
  mountain: ["m", "u", "l", "i", "m", "a"],
  hill: ["i", "k", "i", "l", "i", "m", "a"],
  forest: ["m", "u", "t", "i", "t", "u"],
  field: ["m", "u", "g", "u˩", "n", "d", "a"],
  road: ["m", "u", "n", "j", "i", "l", "a"],
  day: ["i", "s", "i", "k", "u"],
  night: ["b", "u", "s", "i", "k", "u"],
  evening: ["i", "j", "i", "o"],
  year: ["m", "w", "a˩", "k", "a"],
  season: ["i", "k", "i", "p", "i", "n", "d", "i"],
  tree: ["m", "u˥", "t", "i"],
  wood: ["m", "u", "t", "i"],
  leaf: ["i", "j", "a˩", "n", "i"],
  flower: ["i", "u", "a˩"],
  grass: ["m", "a˩", "n", "j", "a", "s", "i"],
  root: ["m", "u", "z", "i"],
  seed: ["m", "b", "e", "g", "u"],
  fruit: ["i", "t", "u", "n", "d", "a"],
  grain: ["i", "p", "u", "n", "d", "a"],
  bark: ["i", "g", "a", "n", "d", "a"],
  dog: ["m", "b", "u", "a˩"],
  cow: ["ɲ", "o", "m", "b", "e"],
  bull: ["i", "n", "d", "u", "m", "e"],
  sheep: ["i", "ⁿg", "o", "n", "d", "o", "l", "o"],
  goat: ["i", "m", "b", "u", "z", "i"],
  pig: ["i", "ⁿg", "u", "r", "u", "b", "e"],
  bear: ["m", "u", "b", "e", "a˩", "l", "e"],
  deer: ["m", "p", "a˩", "l", "a"],
  fish: ["i", "n", "s", "u", "i"],
  bird: ["ɲ", "u", "n", "i"],
  eagle: ["i", "t", "a", "i"],
  snake: ["ɲ", "o", "k", "a"],
  worm: ["m", "a˩", "v", "a˩"],
  louse: ["i", "ɲ", "a˩", "a˩"],
  bee: ["ɲ", "u˥", "k", "i"],
  egg: ["i", "j", "i", "l", "a"],
  feather: ["i", "a˩", "a˩"],
  wing: ["i", "p", "i", "a˩"],
  horn: ["m", "u", "p", "u", "p", "u"],
  tail: ["m", "u", "k", "i", "l", "a"],
  body: ["m", "u", "i", "l", "i"],
  head: ["m", "u˥", "t", "w", "e"],
  hair: ["l", "u", "s", "o˩", "k", "o"],
  face: ["b", "u", "s", "u"],
  eye: ["i", "j", "i", "s", "o"],
  ear: ["k", "u", "t", "w", "i"],
  nose: ["m", "p", "u", "l", "a"],
  mouth: ["m", "u", "l", "o˩", "m", "o"],
  tooth: ["i", "j", "i", "n", "o"],
  tongue: ["l", "u", "l", "i", "m", "i"],
  neck: ["i", "ⁿg", "o", "s", "i"],
  shoulder: ["i", "p", "e", "g", "a"],
  hand: ["m", "u", "k", "o˩", "n", "o"],
  finger: ["i", "j", "a˩", "a˩"],
  nail: ["m", "u", "k", "u", "l", "a"],
  chest: ["i", "k", "i", "f", "u", "a˩"],
  back: ["m", "u", "o˩", "ⁿg", "o"],
  belly: ["i", "t", "u", "m", "b", "o"],
  heart: ["m", "o", "o˥", "j", "o"],
  liver: ["i", "n", "i", "n", "i"],
  lung: ["i", "p", "u", "p", "u"],
  bone: ["i", "k", "u", "p", "a"],
  blood: ["m", "u", "g", "a", "z", "i"],
  skin: ["ⁿg", "o", "p", "i"],
  knee: ["i", "g", "o", "t", "i"],
  leg: ["m", "u", "a˩", "g", "u", "l", "u"],
  foot: ["m", "u", "g", "u", "l", "u"],
  person: ["m", "u˥", "t", "u"],
  man: ["m", "u˥", "a˩", "n", "a", "u", "m", "e"],
  woman: ["m", "u˥", "a˩", "n", "a", "m", "k", "e"],
  child: ["m", "w", "a˩", "n", "a"],
  baby: ["m", "u", "o˥", "t", "o"],
  mother: ["m", "a˩", "m", "a˩"],
  father: ["b", "a˩", "b", "a˩"],
  daughter: ["m", "w", "a˩", "n", "a", "m", "k", "e"],
  brother: ["k", "a˩", "k", "a"],
  sister: ["k", "a˩", "i", "k", "a"],
  husband: ["m", "u˥", "m", "e"],
  wife: ["m", "k", "e"],
  king: ["m", "u˥", "k", "u", "m", "u"],
  god: ["m", "u˥", "ⁿg", "u"],
  guest: ["m", "u", "g", "e", "n", "i"],
  house: ["ɲ", "u˥", "m", "b", "a"],
  door: ["m", "l", "a˩", "ⁿg", "o"],
  hearth: ["i", "j", "i", "k", "o"],
  yoke: ["m", "u", "g", "a", "a˩"],
  wheel: ["m", "u", "p", "i", "g", "i", "l", "i"],
  boat: ["m", "u", "a˩", "t", "u"],
  knife: ["i", "k", "i", "s", "u"],
  axe: ["i", "ʃ", "o˩", "k", "a"],
  spear: ["i", "f", "u˥", "m", "o"],
  bow: ["b", "u", "t", "a˩"],
  arrow: ["m", "u", "p", "i", "g", "a"],
  rope: ["k", "a˩", "m", "b", "a˩"],
  cloth: ["m", "p", "a˩"],
  meat: ["ɲ", "a˩", "m", "a"],
  milk: ["m", "a˩", "z", "i", "w", "a"],
  honey: ["b", "u˩", "j", "u", "k", "i"],
  salt: ["m", "u", "ɲ", "u"],
  be: ["k", "u", "a˩"],
  go: ["e", "n", "d", "a"],
  come: ["j", "a"],
  walk: ["t", "e", "m", "b", "e", "a"],
  run: ["k", "i", "m", "b", "i", "a"],
  stand: ["s", "i", "m", "a"],
  sit: ["k", "a˩", "a˩"],
  fall: ["a", "ⁿg", "u", "k", "a"],
  fly: ["p", "a˩", "a˩"],
  swim: ["o", "g", "e", "l", "e", "a"],
  see: ["o", "n", "a"],
  hear: ["s", "i", "k", "i", "a"],
  know: ["j", "u", "a"],
  think: ["f", "i", "k", "i", "l", "i", "a"],
  speak: ["s", "e", "m", "a"],
  say: ["a", "m", "b", "a"],
  call: ["i", "t", "a"],
  ask: ["u", "l", "i", "z", "a"],
  do: ["t", "e", "n", "d", "a"],
  make: ["t", "e", "n", "g", "e", "n", "e", "z", "a"],
  take: ["t", "w", "a˩", "a˩"],
  give: ["p", "e", "a"],
  hold: ["ʃ", "i", "k", "a"],
  carry: ["b", "e", "b", "a"],
  throw: ["t", "u˥", "p", "a"],
  pull: ["v", "u", "t", "a"],
  push: ["s", "u", "k", "u", "m", "a"],
  cut: ["k", "a˩", "a˩"],
  break: ["v", "u", "n", "j", "a"],
  bend: ["i", "n", "a˩", "m", "a"],
  build: ["j", "e", "n", "g", "a"],
  burn: ["o", "k", "a˩"],
  wash: ["o", "g", "a˩"],
  weave: ["s", "u", "k", "a"],
  plant: ["p", "a˩", "n", "d", "a"],
  eat: ["l", "i", "a"],
  drink: ["ɲ", "w", "a"],
  sleep: ["l", "a˩", "l", "a"],
  dream: ["o", "t", "a"],
  live: ["i", "ʃ", "i"],
  die: ["f", "u", "a"],
  bear_child: ["z", "a", "a"],
  grow: ["k", "u", "a˩"],
  love: ["p", "e", "n", "d", "a"],
  fear: ["o", "p", "a"],
  laugh: ["ʃ", "e", "k", "a"],
  cry: ["l", "i", "a"],
  one: ["m", "o˩", "j", "a"],
  two: ["b", "i", "l", "i"],
  three: ["t", "a˩", "t", "u"],
  four: ["n", "a˩"],
  five: ["t", "a˩", "n", "o"],
  six: ["s", "i", "t", "a"],
  seven: ["s", "a˩", "b", "a"],
  eight: ["n", "a˩", "n", "e"],
  nine: ["k", "e", "n", "d", "a"],
  ten: ["k", "u˥", "m", "i"],
  hundred: ["m", "i", "a"],
  big: ["k", "u", "l", "u"],
  small: ["d", "o˩", "k", "o"],
  long: ["l", "i˥", "l", "i"],
  short: ["f", "u", "p", "i"],
  tall: ["l", "i˥", "l", "i"],
  wide: ["p", "a˩", "n", "a"],
  thick: ["n", "e", "n", "e"],
  thin: ["e", "m", "b", "a˩", "m", "b", "a"],
  heavy: ["z", "i˥", "t", "o"],
  light: ["e", "p", "e", "s", "i"],
  hot: ["m", "o", "t", "o"],
  cold: ["i", "p", "o˥", "l", "o"],
  wet: ["l", "o˩", "a˩"],
  dry: ["k", "a˩", "v", "u"],
  full: ["j", "a˩", "a˩"],
  empty: ["t", "u˥", "p", "u"],
  new: ["ɲ", "i", "a"],
  old: ["z", "a˩", "b", "e"],
  young: ["k", "i", "j", "a˩", "n", "a"],
  good: ["t", "a˩", "m", "u"],
  bad: ["b", "i", "b", "i"],
  sweet: ["t", "a˩", "m", "u"],
  bitter: ["k", "u", "k", "u"],
  strong: ["i", "m", "a˩", "a˩"],
  weak: ["o", "g", "o˩", "a˩"],
  fast: ["k", "a˩", "s", "i"],
  slow: ["p", "o˩", "l", "e"],
  red: ["e", "k", "u˥", "n", "d", "u"],
  black: ["e", "u", "s", "i"],
  white: ["e", "j", "e", "u", "p", "e"],
  green: ["e", "j", "a˩", "n", "i"],
  yellow: ["e", "a˩", "n", "ⁿg", "i"],
  blue: ["e", "b", "u", "l", "u˥"],
  name: ["i", "j", "i˥", "n", "a"],
  word: ["n", "e", "n", "o"],
  truth: ["k", "w", "e", "l", "i"],
  this: ["h", "u", "i"],
  that: ["i", "l", "e"],
  here: ["h", "a˩", "p", "a"],
  there: ["h", "o˩", "k", "o"],
  i: ["m", "i", "m", "i"],
  you: ["w", "e", "w", "e"],
  we: ["s", "i", "s", "i"],
  they: ["w", "a˩"],
  he: ["y", "e", "e"],
  she: ["y", "e", "e"],
  it: ["i˩", "n", "i"],
  and: ["n", "a"],
  or: ["a˩", "u"],
  not: ["s", "i˩"],
  in: ["k", "a", "t", "i"],
  on: ["j", "u", "u"],
  to: ["k", "w", "a"],
  for: ["k", "w", "a"],
  by: ["n", "a"],
  // Phase 47 T4: proto-Bantu derivational prefixes (separate from
  // noun-class inflectional prefixes which the noun-class system
  // handles). ku- (infinitive nominaliser → noun "the V-ing"),
  // m-/mu- (singular agent), ka- (diminutive prefix in many Bantu
  // langs). Tag ends with "-" so synthesis treats as prefix.
  "ku-": ["k", "u"],
  "mu-": ["m", "u"],
  "ka-": ["k", "a"],
};

const BANTU_BOUND_MORPHEMES = new Set<string>([
  "ku-", "mu-", "ka-",
]);

// Phase 29 Tranche 5s: deepened Bantu frequency hints.
const FREQ: Record<Meaning, number> = {
  i: 0.99, you: 0.99, we: 0.97, they: 0.95, he: 0.96, she: 0.96, it: 0.95,
  this: 0.95, that: 0.95, here: 0.92, there: 0.92,
  not: 0.97, and: 0.98, or: 0.93,
  be: 0.97, have: 0.95, do: 0.93, go: 0.95, come: 0.95,
  see: 0.94, say: 0.92, know: 0.92, give: 0.93, take: 0.92,
  make: 0.92, want: 0.92, eat: 0.96, drink: 0.94, sleep: 0.9,
  walk: 0.84, run: 0.85, hear: 0.88, speak: 0.88,
  mother: 0.96, father: 0.96, child: 0.92, brother: 0.85, sister: 0.85,
  hand: 0.88, foot: 0.88, eye: 0.9, head: 0.85, mouth: 0.85,
  ear: 0.83, heart: 0.85, blood: 0.85,
  one: 0.97, two: 0.94, three: 0.92, four: 0.86, five: 0.86,
  water: 0.95, fire: 0.9, day: 0.93, night: 0.93, sun: 0.88, moon: 0.85,
  earth: 0.84, sky: 0.82, star: 0.78, tree: 0.83, stone: 0.82,
  house: 0.88, road: 0.78,
  big: 0.9, small: 0.9, good: 0.92, bad: 0.85, new: 0.83, old: 0.83,
  thunder: 0.55, lightning: 0.5, hill: 0.5, shoulder: 0.5,
};

const MORPHOLOGY: Morphology = {
  paradigms: {
    "noun.class.1": { affix: ["m", "u"], position: "prefix", category: "noun.class.1" },
    "noun.class.2": { affix: ["b", "a"], position: "prefix", category: "noun.class.2" },
    "noun.class.3": { affix: ["m", "u"], position: "prefix", category: "noun.class.3" },
    "noun.class.4": { affix: ["m", "i"], position: "prefix", category: "noun.class.4" },
    "noun.class.5": { affix: ["i"], position: "prefix", category: "noun.class.5" },
    "noun.class.6": { affix: ["m", "a"], position: "prefix", category: "noun.class.6" },
    "noun.class.7": { affix: ["k", "i"], position: "prefix", category: "noun.class.7" },
    "noun.class.8": { affix: ["v", "i"], position: "prefix", category: "noun.class.8" },
    // Phase 36 Tranche 36b: verb-class agreement. Subject's noun
    // class drives a prefix on the verb. Same surface shape as the
    // noun-class prefix in proto-Bantu.
    "verb.cls.1": { affix: ["a"], position: "prefix", category: "verb.cls.1" },
    "verb.cls.2": { affix: ["b", "a"], position: "prefix", category: "verb.cls.2" },
    "verb.cls.3": { affix: ["u"], position: "prefix", category: "verb.cls.3" },
    "verb.cls.4": { affix: ["i"], position: "prefix", category: "verb.cls.4" },
    "verb.cls.5": { affix: ["l", "i"], position: "prefix", category: "verb.cls.5" },
    "verb.cls.6": { affix: ["g", "a"], position: "prefix", category: "verb.cls.6" },
    "verb.cls.7": { affix: ["k", "i"], position: "prefix", category: "verb.cls.7" },
    "verb.cls.8": { affix: ["v", "i"], position: "prefix", category: "verb.cls.8" },
    "noun.num.pl": { affix: ["b", "a"], position: "prefix", category: "noun.num.pl" },
    "verb.tense.past": { affix: ["a"], position: "prefix", category: "verb.tense.past" },
    "verb.tense.fut": { affix: ["t", "a"], position: "prefix", category: "verb.tense.fut" },
    "verb.aspect.pfv": { affix: ["i", "l", "e"], position: "suffix", category: "verb.aspect.pfv" },
    "verb.aspect.ipfv": { affix: ["a", "g", "a"], position: "suffix", category: "verb.aspect.ipfv" },
    "verb.person.1sg": { affix: ["n", "i"], position: "prefix", category: "verb.person.1sg" },
    "verb.person.2sg": { affix: ["u"], position: "prefix", category: "verb.person.2sg" },
    "verb.person.3sg": { affix: ["a"], position: "prefix", category: "verb.person.3sg" },
  },
};

/**
 * Phase 20e-2: Proto-Bantu suppletion fragments.
 *
 * Bantu morphology is dominated by noun-class agreement (handled by the
 * paradigm system, not suppletion), but the copula and a few high-
 * frequency verbs do show stem alternation across tenses. These are
 * conservative reconstructions; descendants will diverge.
 */
const SUPPLETION: NonNullable<import("../types").Language["suppletion"]> = {
  // *-li* perfect-stem of "be" — the copula has distinct stems for the
  // present-progressive vs. anterior tenses across most Bantu daughters.
  be: { "verb.tense.past": ["a˥", "l", "i"] },
  // *-end-* "go" → past *-end-il-e* (long-form perfect)
  go: { "verb.tense.past": ["e", "n", "d", "i", "l", "e"] },
  // *-on-* "see" → *-on-il-e*
  see: { "verb.tense.past": ["o", "n", "i", "l", "e"] },
  // child class-1 / class-2 plural alternation: mwana / bana
  child: { "noun.num.pl": ["b", "a˩", "n", "a"] },
};

export function presetBantu(): SimulationConfig {
  const base = defaultConfig();
  return {
    ...base,
    seed: "bantu",
    seedLexicon: LEXICON,
    seedFrequencyHints: FREQ,
    // Item 3 enrichment (append-only): Bantu agentive/relational nominal
    // compounds via the productive "mwana/mu- + X" pattern this preset already
    // uses for man (mwana+ume) and woman (mwana+mke) — cf. Swahili mwanafunzi
    // (child+learning = student), mwananchi (child+land = citizen), mvuvi
    // (person+fish = fisherman). Built only from existing primitives.
    seedCompounds: {
      // student = child + know (mwana + jua — "knowledge child")
      student: { parts: ["child", "know"] },
      // citizen = child + land (mwana + itaka — "child of the land")
      citizen: { parts: ["child", "earth"] },
      // fisherman = person + fish (mutu + insui — "person of fish")
      fisherman: { parts: ["person", "fish"] },
    },
    seedMorphology: MORPHOLOGY,
    seedSuppletion: SUPPLETION,
    seedCulturalTier: 1,
    seedStressPattern: "penult",
    // Phase 27a: Bantu is CV-heavy with NC clusters (mb-, nd-, ng-) but
    // no codas. Strict to push borrowings toward the canonical shape.
    seedPhonotacticProfile: {
      maxOnset: 2,
      maxCoda: 0,
      maxCluster: 2,
      strictness: 0.85,
    },
    seedGrammar: {
      wordOrder: "SVO",
      articlePresence: "none",
      caseStrategy: "preposition",
      adjectivePosition: "post",
      possessorPosition: "post",
      // Phase 35 Tranche 35c/d/e: Bantu typology — three-way
      // demonstrative (typically i/u, "this near speaker / that
      // near hearer / yonder"), sg-pl, rich aspect (perfective +
      // imperfective + habitual all marked on the verb).
      demonstrativeDistance: "three-way",
      // Phase 36 Tranche 36e: Bantu languages typically mark a
      // subjunctive on the verb stem (Swahili -e ending) for
      // subordinate clauses, optatives, and polite directives.
      moodMarking: "subjunctive",
      numberSystem: "sg-pl",
      aspectSystem: "rich",
      // Phase 39n: Niger-Congo languages frequently mark honorific
      // pronouns / verbal honorifics (Swahili -ku-/-mwa-/-tu-).
      // Seed as "honorific" so daughters can drift to "tiered" or
      // back to "none" via grammaticalisation cascade.
      politenessRegister: "honorific",
    },
    // Phase 31 Tranche 31d: Bantu is tonal — most Niger-Congo
    // languages mark tone on every syllable. The proto-language
    // begins tonal; non-tonal daughters can still emerge via
    // detonogenesis if it pushes coverage below threshold.
    seedToneRegime: "tonal",
    seedToneSandhiRules: ["meeussen", "spread"],
    // Phase 36 Tranche 36b: Bantu noun-class system. Activates the
    // class-prefix realiser and verb-agreement pathway.
    seedNounClassSystem: true,
    seedBoundMorphemes: BANTU_BOUND_MORPHEMES,
    // Phase 73e de-anglicization: proto-Bantu colexifies several concept pairs
    // that English separates — ARM=HAND (*-kono → mukono), MOUTH=LIP (mulomo),
    // FLESH=MEAT (ɲama). All three are registry-attested (concepts.ts
    // COLEX_PAIRS) and were stored as duplicate forms; declare them instead so
    // the concept space reflects Bantu's carving. The winner keeps the form;
    // the absorbed meaning resolves to it via reverse-colex.
    seedColexification: { hand: ["arm"], mouth: ["lip"], meat: ["flesh"], child: ["son"], sleep: ["lie"] },
    seedPhonemeTarget: 32,
    // Phase 46a-migration: proto-Bantu — SVO, post-head modifiers,
    // tonal, rich noun-class agreement, mood marking, honorific
    // politeness. Articles + case-marking off (preposition strategy).
    seedActiveModules: [
      "semantic:lexicon",
      "semantic:clusters",
      "semantic:frequency",
      "semantic:synonymy",
      "semantic:colexification",
      "semantic:borrowing",
      "semantic:calque",
      "semantic:reborrow",
      "semantic:taboo",
      "semantic:coinage",
      "syntactical:wordOrder/svo",
      "syntactical:alignment/nom-acc",
      "syntactical:adj-placement",
      "syntactical:poss-placement",
      "syntactical:num-placement",
      "syntactical:neg-placement",
      "syntactical:relativiser",
      "syntactical:coordination",
      "grammatical:number-system",
      "grammatical:aspect",
      "grammatical:mood",
      "grammatical:politeness",
      "grammatical:reference-tracking",
      "grammatical:numerals",
      "grammatical:demonstratives",
      "morphological:paradigms",
      "morphological:derivation",
      "morphological:inflection-class",
      "morphological:agreement",
      "morphological:analogy",
    ],
    preset: "bantu",
  };
}
