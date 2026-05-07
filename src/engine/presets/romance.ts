import type { SimulationConfig, Lexicon, Meaning } from "../types";
import type { Morphology } from "../morphology/types";
import { defaultConfig } from "../config";

// Phase 48 T15: Romance preset notation notes.
//
// This preset represents Vulgar Latin / Proto-Romance — NOT
// Classical Latin. Differences:
//
// - Vowel system: 7-vowel Vulgar Latin /a ɛ e i ɔ o u/. Phonemic
//   vowel length (Classical Latin /aː eː iː oː uː/) was lost by
//   Vulgar Latin and replaced by the quality contrast (open-mid
//   /ɛ ɔ/ vs close-mid /e o/). So entries DO NOT use `ː`.
// - Spirantisation: intervocalic `b` → `β` already underway in
//   Vulgar Latin (e.g., `niβe` "snow", `silβa` "forest"). Encoded
//   as `β` not `b` in those positions.
// - The seedGrammar declares `caseStrategy: "case"` reflecting
//   inherited Classical Latin morphology that Vulgar Latin retained
//   in form even as the actual case distinctions were collapsing.
//   Daughters lose case morphology via regular drift.

const LEXICON: Lexicon = {
  water: ["a", "k", "w", "a"],
  fire: ["f", "ɔ", "k", "u"],
  stone: ["p", "ɛ", "t", "ɾ", "a"],
  earth: ["t", "ɛ", "ɾ", "ɾ", "a"],
  sky: ["k", "a", "i", "l", "u"],
  sun: ["s", "ɔ", "l", "e"],
  moon: ["l", "u", "n", "a"],
  star: ["s", "t", "e", "l", "l", "a"],
  cloud: ["n", "u", "b", "e"],
  rain: ["p", "l", "u", "β", "j", "a"],
  snow: ["n", "i", "β", "e"],
  ice: ["g", "l", "a", "k", "j", "e"],
  wind: ["β", "e", "n", "t", "u"],
  thunder: ["t", "o", "n", "i", "t", "ɾ", "u"],
  lightning: ["f", "u", "l", "g", "u", "ɾ", "e"],
  river: ["f", "l", "u", "m", "e"],
  sea: ["m", "a", "ɾ", "e"],
  lake: ["l", "a", "k", "u"],
  mountain: ["m", "o", "n", "t", "e"],
  hill: ["k", "o", "l", "l", "e"],
  valley: ["β", "a", "l", "l", "e"],
  forest: ["s", "i", "l", "β", "a"],
  field: ["k", "a", "m", "p", "u"],
  road: ["β", "i", "a"],
  path: ["s", "e", "m", "i", "t", "a"],
  day: ["d", "i", "e"],
  night: ["n", "ɔ", "k", "t", "e"],
  morning: ["m", "a", "n", "e"],
  evening: ["s", "e", "ɾ", "a"],
  year: ["a", "n", "n", "u"],
  season: ["t", "e", "m", "p", "u", "s"],
  winter: ["i", "β", "e", "ɾ", "n", "u"],
  summer: ["s", "t", "a", "t", "e"],
  time: ["t", "e", "m", "p", "u"],
  tree: ["a", "ɾ", "b", "o", "ɾ", "e"],
  wood: ["l", "i", "g", "n", "u"],
  leaf: ["f", "o", "l", "j", "a"],
  flower: ["f", "l", "o", "ɾ", "e"],
  grass: ["e", "ɾ", "b", "a"],
  root: ["ɾ", "a", "d", "i", "k", "e"],
  seed: ["s", "e", "m", "e", "n"],
  fruit: ["f", "ɾ", "u", "k", "t", "u"],
  grain: ["g", "ɾ", "a", "n", "u"],
  bark: ["k", "o", "ɾ", "t", "i", "k", "e"],
  oak: ["k", "w", "e", "ɾ", "k", "u"],
  birch: ["b", "e", "t", "u", "l", "a"],
  apple: ["m", "e", "l", "a"],
  dog: ["k", "a", "n", "e"],
  wolf: ["l", "u", "p", "u"],
  horse: ["k", "a", "b", "a", "l", "l", "u"],
  cow: ["β", "a", "k", "k", "a"],
  bull: ["t", "a", "u", "ɾ", "u"],
  sheep: ["o", "β", "e", "k", "u", "l", "a"],
  goat: ["k", "a", "p", "ɾ", "a"],
  pig: ["p", "ɔ", "ɾ", "k", "u"],
  bear: ["u", "ɾ", "s", "u"],
  deer: ["k", "e", "ɾ", "β", "u"],
  fish: ["p", "i", "s", "k", "e"],
  bird: ["a", "β", "i", "k", "e", "l", "l", "u"],
  eagle: ["a", "k", "w", "i", "l", "a"],
  snake: ["s", "e", "ɾ", "p", "e", "n", "t", "e"],
  worm: ["β", "e", "ɾ", "m", "e"],
  louse: ["p", "e", "d", "u", "k", "u"],
  bee: ["a", "p", "i", "k", "u", "l", "a"],
  egg: ["ɔ", "β", "u"],
  feather: ["p", "e", "n", "n", "a"],
  wing: ["a", "l", "a"],
  horn: ["k", "o", "ɾ", "n", "u"],
  tail: ["k", "a", "u", "d", "a"],
  body: ["k", "ɔ", "ɾ", "p", "u", "s"],
  head: ["k", "a", "p", "u", "t"],
  hair: ["k", "a", "p", "i", "l", "l", "u"],
  face: ["f", "a", "k", "j", "e"],
  eye: ["ɔ", "k", "u", "l", "u"],
  ear: ["a", "u", "ɾ", "i", "k", "u", "l", "a"],
  nose: ["n", "a", "s", "u"],
  mouth: ["b", "o", "k", "k", "a"],
  tooth: ["d", "ɛ", "n", "t", "e"],
  tongue: ["l", "i", "n", "g", "w", "a"],
  lip: ["l", "a", "b", "j", "u"],
  neck: ["k", "o", "l", "l", "u"],
  shoulder: ["s", "p", "a", "t", "u", "l", "a"],
  arm: ["b", "ɾ", "a", "k", "j", "u"],
  hand: ["m", "a", "n", "u"],
  finger: ["d", "i", "g", "i", "t", "u"],
  nail: ["u", "n", "g", "u", "l", "a"],
  chest: ["p", "e", "k", "t", "u", "s"],
  back: ["d", "o", "ɾ", "s", "u"],
  belly: ["β", "e", "n", "t", "ɾ", "e"],
  heart: ["k", "ɔ", "ɾ"],
  liver: ["f", "i", "k", "a", "t", "u"],
  lung: ["p", "u", "l", "m", "o", "n", "e"],
  bone: ["ɔ", "s", "s", "u"],
  blood: ["s", "a", "n", "g", "w", "e"],
  skin: ["p", "e", "l", "l", "e"],
  flesh: ["k", "a", "ɾ", "n", "e"],
  knee: ["g", "e", "n", "u", "k", "u", "l", "u"],
  leg: ["g", "a", "m", "b", "a"],
  foot: ["p", "e", "d", "e"],
  person: ["p", "e", "ɾ", "s", "o", "n", "a"],
  man: ["o", "m", "i", "n", "e"],
  woman: ["m", "u", "l", "j", "e", "ɾ", "e"],
  child: ["i", "n", "f", "a", "n", "t", "e"],
  baby: ["i", "n", "f", "a", "n", "t", "e"],
  mother: ["m", "a", "t", "ɾ", "e"],
  father: ["p", "a", "t", "ɾ", "e"],
  son: ["f", "i", "l", "j", "u"],
  daughter: ["f", "i", "l", "j", "a"],
  brother: ["f", "ɾ", "a", "t", "ɾ", "e"],
  sister: ["s", "o", "ɾ", "o", "ɾ", "e"],
  husband: ["m", "a", "ɾ", "i", "t", "u"],
  wife: ["s", "p", "o", "n", "s", "a"],
  king: ["ɾ", "e", "g", "e"],
  god: ["d", "ɛ", "u"],
  guest: ["o", "s", "p", "e", "t", "e"],
  enemy: ["i", "n", "i", "m", "i", "k", "u"],
  house: ["k", "a", "s", "a"],
  door: ["p", "o", "ɾ", "t", "a"],
  hearth: ["f", "o", "k", "u"],
  yoke: ["j", "u", "g", "u"],
  wheel: ["ɾ", "o", "t", "a"],
  boat: ["b", "a", "ɾ", "k", "a"],
  ship: ["n", "a", "β", "e"],
  knife: ["k", "u", "l", "t", "e", "l", "l", "u"],
  axe: ["s", "e", "k", "u", "ɾ", "e"],
  spear: ["l", "a", "n", "k", "j", "a"],
  bow: ["a", "ɾ", "k", "u"],
  arrow: ["s", "a", "g", "i", "t", "t", "a"],
  rope: ["k", "o", "ɾ", "d", "a"],
  cloth: ["β", "e", "s", "t", "e"],
  wool: ["l", "a", "n", "a"],
  bread: ["p", "a", "n", "e"],
  meat: ["k", "a", "ɾ", "n", "e"],
  milk: ["l", "a", "k", "t", "e"],
  honey: ["m", "e", "l", "e"],
  salt: ["s", "a", "l", "e"],
  wine: ["β", "i", "n", "u"],
  oil: ["o", "l", "j", "u"],
  be: ["e", "s", "s", "e", "ɾ", "e"],
  go: ["i", "ɾ"],
  come: ["β", "e", "n", "i", "ɾ", "e"],
  walk: ["a", "m", "b", "u", "l", "a", "ɾ", "e"],
  run: ["k", "u", "ɾ", "ɾ", "e", "ɾ", "e"],
  stand: ["s", "t", "a", "ɾ", "e"],
  sit: ["s", "e", "d", "e", "ɾ", "e"],
  lie: ["j", "a", "k", "e", "ɾ", "e"],
  fall: ["k", "a", "d", "e", "ɾ", "e"],
  fly: ["β", "ɔ", "l", "a", "ɾ", "e"],
  swim: ["n", "a", "t", "a", "ɾ", "e"],
  see: ["β", "i", "d", "e", "ɾ", "e"],
  hear: ["a", "u", "d", "i", "ɾ", "e"],
  know: ["s", "k", "i", "ɾ", "e"],
  think: ["k", "o", "g", "i", "t", "a", "ɾ", "e"],
  speak: ["p", "a", "ɾ", "a", "b", "o", "l", "a", "ɾ", "e"],
  say: ["d", "i", "k", "e", "ɾ", "e"],
  call: ["k", "l", "a", "m", "a", "ɾ", "e"],
  ask: ["ɾ", "o", "g", "a", "ɾ", "e"],
  do: ["f", "a", "k", "e", "ɾ", "e"],
  make: ["f", "a", "k", "e", "ɾ", "e"],
  take: ["p", "ɾ", "e", "n", "d", "e", "ɾ", "e"],
  give: ["d", "a", "ɾ", "e"],
  hold: ["t", "e", "n", "e", "ɾ", "e"],
  carry: ["p", "o", "ɾ", "t", "a", "ɾ", "e"],
  throw: ["j", "a", "k", "t", "a", "ɾ", "e"],
  pull: ["t", "i", "ɾ", "a", "ɾ", "e"],
  push: ["p", "u", "l", "s", "a", "ɾ", "e"],
  cut: ["t", "a", "l", "j", "a", "ɾ", "e"],
  break: ["ɾ", "u", "m", "p", "e", "ɾ", "e"],
  bend: ["p", "l", "i", "k", "a", "ɾ", "e"],
  build: ["k", "o", "n", "s", "t", "ɾ", "u", "e", "ɾ", "e"],
  burn: ["u", "ɾ", "e", "ɾ", "e"],
  wash: ["l", "a", "β", "a", "ɾ", "e"],
  weave: ["t", "e", "k", "s", "e", "ɾ", "e"],
  plant: ["p", "l", "a", "n", "t", "a", "ɾ", "e"],
  eat: ["k", "o", "m", "e", "d", "e", "ɾ", "e"],
  drink: ["b", "i", "b", "e", "ɾ", "e"],
  sleep: ["d", "o", "ɾ", "m", "i", "ɾ", "e"],
  dream: ["s", "o", "m", "n", "j", "a", "ɾ", "e"],
  live: ["β", "i", "β", "e", "ɾ", "e"],
  die: ["m", "o", "ɾ", "i", "ɾ", "e"],
  bear_child: ["p", "a", "ɾ", "e", "ɾ", "e"],
  grow: ["k", "ɾ", "e", "s", "k", "e", "ɾ", "e"],
  love: ["a", "m", "a", "ɾ", "e"],
  fear: ["t", "i", "m", "e", "ɾ", "e"],
  laugh: ["ɾ", "i", "d", "e", "ɾ", "e"],
  cry: ["p", "l", "o", "ɾ", "a", "ɾ", "e"],
  one: ["u", "n", "u"],
  two: ["d", "u", "o"],
  three: ["t", "ɾ", "e", "s"],
  four: ["k", "w", "a", "t", "t", "o", "ɾ"],
  five: ["k", "w", "i", "n", "k", "w", "e"],
  six: ["s", "e", "k", "s"],
  seven: ["s", "e", "p", "t", "e"],
  eight: ["o", "k", "t", "o"],
  nine: ["n", "o", "β", "e"],
  ten: ["d", "e", "k", "e"],
  hundred: ["k", "e", "n", "t", "u"],
  big: ["g", "ɾ", "a", "n", "d", "e"],
  small: ["p", "i", "k", "k", "u", "l", "u"],
  long: ["l", "o", "n", "g", "u"],
  short: ["b", "ɾ", "e", "β", "e"],
  tall: ["a", "l", "t", "u"],
  wide: ["l", "a", "ɾ", "g", "u"],
  thick: ["k", "ɾ", "a", "s", "s", "u"],
  thin: ["t", "e", "n", "u", "j", "u"],
  heavy: ["g", "ɾ", "e", "β", "e"],
  light: ["l", "e", "β", "e"],
  hot: ["k", "a", "l", "d", "u"],
  cold: ["f", "ɾ", "i", "g", "i", "d", "u"],
  wet: ["u", "m", "i", "d", "u"],
  dry: ["s", "i", "k", "k", "u"],
  full: ["p", "l", "e", "n", "u"],
  empty: ["β", "a", "k", "u", "u"],
  new: ["n", "ɔ", "β", "u"],
  old: ["β", "ɛ", "t", "u", "l", "u"],
  young: ["j", "u", "β", "e", "n", "e"],
  good: ["b", "ɔ", "n", "u"],
  bad: ["m", "a", "l", "u"],
  sweet: ["d", "u", "l", "k", "j", "u"],
  bitter: ["a", "m", "a", "ɾ", "u"],
  strong: ["f", "o", "ɾ", "t", "e"],
  weak: ["d", "e", "b", "i", "l", "e"],
  fast: ["k", "i", "t", "u"],
  slow: ["l", "e", "n", "t", "u"],
  red: ["ɾ", "u", "b", "j", "u"],
  black: ["n", "i", "g", "ɾ", "u"],
  white: ["b", "l", "a", "n", "k", "u"],
  green: ["β", "i", "ɾ", "i", "d", "e"],
  yellow: ["g", "a", "l", "b", "u"],
  blue: ["k", "a", "e", "ɾ", "u", "l", "u"],
  name: ["n", "o", "m", "e", "n"],
  word: ["β", "e", "ɾ", "b", "u"],
  truth: ["β", "e", "ɾ", "i", "t", "a", "t", "e"],
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
  on: ["s", "u", "p", "ɾ", "a"],
  to: ["a", "d"],
  for: ["p", "ɾ", "o"],
  by: ["p", "e", "ɾ"],
  // Phase 36 Tranche 36n: Latin derivational morphemes. -tor agentive
  // (factor, doctor); -tio nominalisation (actio, passio); -tas abstract
  // (libertas, veritas); -arius adjectival agentive (sicarius); -ulus
  // diminutive (parvulus). Seeded as bound morphemes; flow through
  // sound change to /-tre/, /-zone/, /-tat/, /-aire/, /-uolo/ in
  // Romance daughters.
  "-tor.agt": ["t", "o", "ɾ"],
  "-tio.nmlz": ["t", "i", "o"],
  "-tas.abs": ["t", "a", "s"],
  "-arius.agt": ["a", "ɾ", "i", "u", "s"],
  "-ulus.dim": ["u", "l", "u", "s"],
  // Phase 47 T4: Latin-style prefixes (suffix-leaning SVO; few prefixes
  // active in Late Latin → Romance). dis- separation, re- repetition,
  // prae- before, in- inside (also negational in some words).
  "dis-": ["d", "i", "s"],
  "re-": ["ɾ", "e"],
  "prae-": ["p", "ɾ", "a", "e"],
  "in-": ["i", "n"],
};

const ROMANCE_BOUND_MORPHEMES = new Set<string>([
  "-tor.agt", "-tio.nmlz", "-tas.abs", "-arius.agt", "-ulus.dim",
  // Phase 47 T4: derivational prefixes. dis-/in- are negational and
  // fire only on rung 5; re-/prae- fire on the standard non-neg rung.
  "dis-", "re-", "prae-", "in-",
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
    "verb.tense.past": { affix: ["a", "β", "i"], position: "suffix", category: "verb.tense.past" },
    "verb.tense.fut": { affix: ["a", "b", "o"], position: "suffix", category: "verb.tense.fut" },
    "verb.aspect.pfv": { affix: ["a", "β", "i"], position: "suffix", category: "verb.aspect.pfv" },
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
  see: { "verb.tense.past": ["β", "i", "d", "i"] },
  // *facere* "make/do" → perfect *fēci* (we use the eat slot since
  // make isn't in the Romance seedLexicon)
  // Comparative degree
  good: { "adj.degree.cmp": ["m", "e", "l", "j", "o", "ɾ", "e"] },
  bad: { "adj.degree.cmp": ["p", "e", "j", "o", "ɾ", "e"] },
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
    seedInfinitiveStrategy: { kind: "affix-suffix", affix: ["ɾ", "e"] },
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
    seedPhonemeTarget: 30,
    // Phase 46a-migration: Latin/Common Romance — SVO, case morphology,
    // subjunctive mood, T-V politeness. Articles emerge later via
    // grammaticalisation pathway (excluded at seed; Phase 33i/46d
    // would activate the module mid-run when the article emerges).
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
      "grammatical:case-marking",
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
    preset: "romance",
  };
}
