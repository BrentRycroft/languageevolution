import type { SimulationConfig, Lexicon, Meaning } from "../types";
import type { Morphology } from "../morphology/types";
import { defaultConfig } from "../config";

const LEXICON: Lexicon = {
  water: ["t", "e", "l", "o"],
  fire: ["s", "e", "l", "i"],
  stone: ["k", "i", "w", "e", "n"],
  tree: ["k", "a", "s", "i"],
  sun: ["s", "u", "n", "o"],
  moon: ["m", "u", "n"],
  star: ["m", "u", "n"],
  night: ["p", "i", "m", "e", "j", "a"],
  day: ["s", "u", "n", "o"],
  sky: ["s", "e", "w", "i"],
  earth: ["m", "a"],
  sea: ["t", "e", "l", "o"],

  head: ["l", "a", "w", "a"],
  eye: ["l", "u", "k", "i", "n"],
  mouth: ["u", "t", "a"],
  ear: ["k", "u", "t", "e"],
  hand: ["l", "u", "k", "a"],
  foot: ["n", "o", "k", "a"],
  body: ["s", "i", "j", "e", "l", "o"],
  skin: ["s", "e", "l", "o"],
  bone: ["k", "i", "w", "e", "n"],
  blood: ["t", "e", "l", "o"],
  hair: ["l", "i", "n", "j", "a"],
  nose: ["n", "e", "n", "a"],
  heart: ["p", "i", "l", "i", "n"],

  mother: ["m", "a", "m", "a"],
  father: ["m", "a", "m", "a"],
  child: ["j", "a", "n"],
  friend: ["j", "a", "n"],
  wife: ["m", "e", "l", "i"],
  husband: ["m", "i", "j", "e"],

  go: ["t", "a", "w", "a"],
  come: ["t", "a", "w", "a"],
  see: ["l", "u", "k", "i", "n"],
  know: ["s", "o", "n", "a"],
  eat: ["m", "o", "k", "u"],
  drink: ["m", "o", "k", "u"],
  sleep: ["l", "a", "p", "e"],
  die: ["m", "o", "l", "i"],
  speak: ["t", "o", "k", "i"],
  hear: ["k", "u", "t", "e"],
  fight: ["u", "t", "a", "l", "a"],
  work: ["p", "a", "l", "i"],
  give: ["p", "a", "n", "a"],
  open: ["o", "p", "e", "n"],
  stay: ["a", "w", "e", "n"],

  dog: ["s", "o", "w", "e", "l", "i"],
  cow: ["s", "o", "w", "e", "l", "i"],
  wolf: ["s", "o", "w", "e", "l", "i"],
  horse: ["s", "o", "w", "e", "l", "i"],
  fish: ["k", "a", "l", "a"],
  bird: ["w", "a", "s", "o"],
  snake: ["p", "i", "p", "i"],
  cat: ["s", "o", "w", "e", "l", "i"],
  bear: ["s", "o", "w", "e", "l", "i"],

  flower: ["k", "a", "s", "i"],
  fruit: ["k", "i", "l", "i"],
  seed: ["k", "i", "l", "i"],
  leaf: ["l", "i", "p", "u"],

  good: ["p", "o", "n", "a"],
  bad: ["i", "k", "e"],
  big: ["s", "u", "l", "i"],
  small: ["l", "i", "l", "i"],
  new: ["s", "i", "n"],
  old: ["t", "e", "n", "p", "o"],
  hot: ["s", "e", "l", "i"],
  cold: ["l", "e", "t", "e"],
  hard: ["k", "i", "w", "e", "n"],
  soft: ["k", "o"],
  strong: ["w", "a", "w", "a"],
  weak: ["l", "i", "l", "i"],
  long: ["l", "i", "n", "j", "a"],
  short: ["l", "i", "l", "i"],

  i: ["m", "i"],
  you: ["s", "i", "n", "a"],
  they: ["o", "n", "a"],
  we: ["m", "i"],
  "he-she": ["o", "n", "a"],
  this: ["n", "i"],
  that: ["n", "i"],

  one: ["w", "a", "n"],
  two: ["t", "u"],
  three: ["m", "u", "t", "e"],
  many: ["m", "u", "t", "e"],
  few: ["l", "i", "l", "i"],

  name: ["n", "i", "m", "i"],
  word: ["n", "i", "m", "i"],
  song: ["k", "a", "l", "a", "m", "a"],
  home: ["t", "o", "m", "o"],
  village: ["m", "a"],
  road: ["n", "a", "s", "i", "n"],
  love: ["o", "l", "i", "n"],
  war: ["u", "t", "a", "l", "a"],
  free: ["k", "e", "n"],
  spirit: ["k", "o", "n"],
  god: ["s", "e", "w", "i"],
  law: ["l", "a", "w", "a"],
  gift: ["p", "a", "n", "a"],
  story: ["t", "o", "k", "i"],
  he: ["o", "n", "a"],
  she: ["o", "n", "a"],
  it: ["n", "i"],
  and: ["e", "n"],
  or: ["a", "n", "u"],
  not: ["a", "l", "a"],
  in: ["l", "o", "n"],
  on: ["s", "u", "p", "a"],
  to: ["t", "a", "w", "a"],
  for: ["t", "a", "w", "a"],
  by: ["k", "e", "p", "e", "k", "e", "n"],
  yellow: ["j", "e", "l", "o"],
  red: ["l", "o", "j", "e"],
  blue: ["l", "a", "s", "o"],
  green: ["l", "a", "s", "o"],
  white: ["w", "a", "l", "o"],
  black: ["p", "i", "m", "e", "j", "a"],
  time: ["t", "e", "n", "p", "o"],
  thing: ["i", "j", "o"],
  all: ["a", "l", "i"],
  become: ["k", "a", "m", "a"],
};

// Phase 29 Tranche 5s: deepened Toki Pona frequency hints. Toki
// Pona's "core" lexicon is ~120 words so a high fraction of the
// lexicon is always high-frequency by design.
const FREQ: Record<Meaning, number> = {
  i: 0.98, you: 0.98, we: 0.95, this: 0.95, that: 0.95,
  not: 0.95, and: 0.95, or: 0.9,
  be: 0.95, have: 0.9, go: 0.95, come: 0.92, see: 0.9, say: 0.9,
  know: 0.88, give: 0.85, take: 0.85, eat: 0.9, drink: 0.88,
  speak: 0.9, hear: 0.85, sleep: 0.82, walk: 0.8,
  good: 0.95, bad: 0.9, big: 0.85, small: 0.85, new: 0.78, old: 0.78,
  mother: 0.88, father: 0.88, child: 0.85,
  hand: 0.83, foot: 0.83, eye: 0.85, head: 0.82, mouth: 0.82,
  one: 0.95, two: 0.92,
  water: 0.9, fire: 0.85, sun: 0.85, moon: 0.8,
  earth: 0.78, sky: 0.78, tree: 0.8, stone: 0.78,
  day: 0.85, night: 0.85,
};

const MORPHOLOGY: Morphology = { paradigms: {} };

const RULE_BIAS: Record<string, number> = {
  lenition: 0.5,
  fortition: 0.5,
  place_assim: 0.8,
  palatalization: 1,
  vowel_shift: 0.9,
  vowel_reduction: 0.7,
  harmony: 0.8,
  deletion: 0.6,
  metathesis: 0.1,
  tone: 0.1,
};

export function presetTokipona(): SimulationConfig {
  const base = defaultConfig();
  return {
    ...base,
    seed: "tokipona",
    seedLexicon: LEXICON,
    seedFrequencyHints: FREQ,
    seedMorphology: MORPHOLOGY,
    // Toki Pona is deliberately atavistic — small lexicon, no irregular
    // morphology, no writing tradition. Tier 0 keeps it that way.
    seedCulturalTier: 0,
    seedStressPattern: "initial",
    // Phase 27a: Polynesian-style strict CV — no clusters, no codas.
    // Highest strictness so even single-step erosion away from CV gets
    // repaired.
    seedPhonotacticProfile: {
      maxOnset: 1,
      maxCoda: 0,
      maxCluster: 1,
      strictness: 0.95,
    },
    seedGrammar: {
      wordOrder: "SVO",
      articlePresence: "none",
      caseStrategy: "preposition",
      adjectivePosition: "pre",
      possessorPosition: "pre",
      // Phase 39n: extreme isolating — Toki Pona has 137 lexemes,
      // no inflection, no agreement. synthesisIndex 0.2 reflects
      // this; pre-39n the simulator mid-range hid Toki Pona's true
      // type.
      synthesisIndex: 0.2,
      hasCase: false,
      // Phase 36 Tranche 36a: Toki Pona has no native plural marker
      // (mute "many" is a separate word). For simulator purposes use
      // partial-initial reduplication — small, vowel-rich syllables
      // accept reduplicated marking cleanly.
      pluralMarking: "reduplication",
    },
    // Phase 31 Tranche 31d: Toki Pona is non-tonal by design.
    seedToneRegime: "non-tonal",
    seedPhonemeTarget: 14,
    preset: "tokipona",
  };
}

// Phase 29 Tranche 9h: TOKIPONA_RULE_BIAS export removed — it was
// never consumed (no config path took it as input). The values lived
// on as a stranded module export. If a future preset wants to tune
// per-family rule weights at language birth, plumb `seedRuleBias` /
// `lang.ruleBias` through SimulationConfig and re-introduce.
void RULE_BIAS;
