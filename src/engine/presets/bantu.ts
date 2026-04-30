import type { SimulationConfig, Lexicon, Meaning } from "../types";
import type { Morphology } from "../morphology/types";
import { defaultConfig } from "../config";

// Hand-authored Proto-Bantu seed (highly simplified). Forms approximate
// Guthrie / Bastin reconstructions: CV syllables, vowel-initial noun-class
// stems, two-tone melody (˥ high, ˩ low), prenasalized stops as single
// segments, palatal series (ɲ, j) preserved.
const LEXICON: Lexicon = {
  // — natural world / weather —
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
  // Proto-Bantu had no securely-reconstructed "sea" lexeme (the
  // *bahari Swahili form is an Arabic loan). Use the lake-extension
  // *jɪ̀dà — many descendants conflate sea / lake.
  sea: ["i", "j", "i", "d", "a"],
  lake: ["i", "z", "i", "w", "a"],
  mountain: ["m", "u", "l", "i", "m", "a"],
  hill: ["i", "k", "i", "l", "i", "m", "a"],
  forest: ["m", "u", "t", "i", "t", "u"],
  // PB *gʊ̀ndá "field, garden" (Swahili `shamba` is an Arabic loan).
  field: ["m", "u", "g", "u˩", "n", "d", "a"],
  road: ["m", "u", "n", "j", "i", "l", "a"],
  // — sky cycle / time —
  day: ["i", "s", "i", "k", "u"],
  night: ["b", "u", "s", "i", "k", "u"],
  // Swahili `asubuhi` (morning) is Arabic أول صبح — not PB; dropped.
  evening: ["i", "j", "i", "o"],
  year: ["m", "w", "a˩", "k", "a"],
  season: ["i", "k", "i", "p", "i", "n", "d", "i"],
  // Swahili `muda` (time) is Arabic مدّة — not PB; dropped.
  // — flora / fauna —
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
  // No Proto-Bantu word for `oak` or `apple` (post-PB Portuguese
  // loans) and `wolf` / `horse` (areal loans / no PB referent).
  // `dog` *bʊ́á attested.
  // — animals —
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
  // — body —
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
  lip: ["m", "u", "l", "o˩", "m", "o"],
  neck: ["i", "ⁿg", "o", "s", "i"],
  shoulder: ["i", "p", "e", "g", "a"],
  arm: ["m", "u", "k", "o˩", "n", "o"],
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
  flesh: ["ɲ", "a˩", "m", "a"],
  knee: ["i", "g", "o", "t", "i"],
  leg: ["m", "u", "a˩", "g", "u", "l", "u"],
  // PB *gùdù "foot" (Swahili mguu); previously duplicated `bone`'s
  // form `ikupa`. Now distinct, sharing a root with `leg` (which
  // many Bantu languages also conflate — but at least bone ≠ foot).
  foot: ["m", "u", "g", "u", "l", "u"],
  // — kinship / people —
  person: ["m", "u˥", "t", "u"],
  man: ["m", "u˥", "a˩", "n", "a", "u", "m", "e"],
  woman: ["m", "u˥", "a˩", "n", "a", "m", "k", "e"],
  child: ["m", "w", "a˩", "n", "a"],
  baby: ["m", "u", "o˥", "t", "o"],
  mother: ["m", "a˩", "m", "a˩"],
  father: ["b", "a˩", "b", "a˩"],
  son: ["m", "w", "a˩", "n", "a"],
  daughter: ["m", "w", "a˩", "n", "a", "m", "k", "e"],
  brother: ["k", "a˩", "k", "a"],
  // *dada "sister" is Swahili nursery; PB *kádí. Reuse the brother
  // root with the káìká reduplication pattern.
  sister: ["k", "a˩", "i", "k", "a"],
  husband: ["m", "u˥", "m", "e"],
  wife: ["m", "k", "e"],
  // PB *kʊ́mʊ́ "chief, ruler" (Swahili `mfalme` is an Arabic loan).
  king: ["m", "u˥", "k", "u", "m", "u"],
  god: ["m", "u˥", "ⁿg", "u"],
  guest: ["m", "u", "g", "e", "n", "i"],
  // Drop `enemy` — Swahili `adui` is Arabic; PB lacked a single
  // dedicated lexeme.
  // — household / artifact —
  house: ["ɲ", "u˥", "m", "b", "a"],
  door: ["m", "l", "a˩", "ⁿg", "o"],
  hearth: ["i", "j", "i", "k", "o"],
  yoke: ["m", "u", "g", "a", "a˩"],
  wheel: ["m", "u", "p", "i", "g", "i", "l", "i"],
  boat: ["m", "u", "a˩", "t", "u"],
  // Swahili `meli` is an English loan (← "mail-boat"); drop.
  knife: ["i", "k", "i", "s", "u"],
  axe: ["i", "ʃ", "o˩", "k", "a"],
  spear: ["i", "f", "u˥", "m", "o"],
  bow: ["b", "u", "t", "a˩"],
  arrow: ["m", "u", "p", "i", "g", "a"],
  rope: ["k", "a˩", "m", "b", "a˩"],
  cloth: ["m", "p", "a˩"],
  // — food / drink —
  // Swahili `mkate` is an Arabic loan; PB had no securely-reconstructed
  // bread word (cassava / millet / sorghum varied per region). Drop.
  meat: ["ɲ", "a˩", "m", "a"],
  milk: ["m", "a˩", "z", "i", "w", "a"],
  // PB *jʊ̀kɪ̀ "honey" (Swahili `asali` is Arabic عسل).
  honey: ["b", "u˩", "j", "u", "k", "i"],
  salt: ["m", "u", "ɲ", "u"],
  // — verbs of motion / state —
  be: ["k", "u", "a˩"],
  go: ["e", "n", "d", "a"],
  come: ["j", "a"],
  walk: ["t", "e", "m", "b", "e", "a"],
  run: ["k", "i", "m", "b", "i", "a"],
  stand: ["s", "i", "m", "a"],
  sit: ["k", "a˩", "a˩"],
  lie: ["l", "a˩", "l", "a"],
  fall: ["a", "ⁿg", "u", "k", "a"],
  fly: ["p", "a˩", "a˩"],
  swim: ["o", "g", "e", "l", "e", "a"],
  // — verbs of perception / cognition —
  see: ["o", "n", "a"],
  hear: ["s", "i", "k", "i", "a"],
  know: ["j", "u", "a"],
  think: ["f", "i", "k", "i", "l", "i", "a"],
  speak: ["s", "e", "m", "a"],
  say: ["a", "m", "b", "a"],
  call: ["i", "t", "a"],
  ask: ["u", "l", "i", "z", "a"],
  // — verbs of action —
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
  // — verbs of life —
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
  // — numbers —
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
  // — qualities —
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
  // PB *pɔ́lɔ̀ "cold, cool" (Swahili `baridi` is Arabic بارد).
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
  // — colour —
  red: ["e", "k", "u˥", "n", "d", "u"],
  black: ["e", "u", "s", "i"],
  white: ["e", "j", "e", "u", "p", "e"],
  green: ["e", "j", "a˩", "n", "i"],
  yellow: ["e", "a˩", "n", "ⁿg", "i"],
  blue: ["e", "b", "u", "l", "u˥"],
  // — abstract / pronouns —
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
  // — closed-class roots (Swahili-flavoured Proto-Bantu shapes;
  //   articles handled morphologically by the noun-class prefix
  //   system, so we leave articlePresence at "none"). —
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
};

const FREQ: Record<Meaning, number> = {
  water: 0.95, fire: 0.9, mother: 0.96, father: 0.96, child: 0.92,
  eat: 0.96, go: 0.95, come: 0.95, see: 0.94, drink: 0.94, sleep: 0.9,
  one: 0.97, two: 0.94, three: 0.92, big: 0.9, small: 0.9,
  i: 0.99, you: 0.99, we: 0.97, this: 0.95, that: 0.95,
  be: 0.97, do: 0.93, make: 0.92, give: 0.93, take: 0.92,
  day: 0.93, night: 0.93, sun: 0.88, moon: 0.85,
  hand: 0.88, foot: 0.88, eye: 0.9, head: 0.85,
};

const MORPHOLOGY: Morphology = {
  paradigms: {
    // Bantu-style noun-class prefixes + concord markers.
    "noun.class.1": { affix: ["m", "u"], position: "prefix", category: "noun.class.1" },
    "noun.class.2": { affix: ["b", "a"], position: "prefix", category: "noun.class.2" },
    "noun.class.3": { affix: ["m", "u"], position: "prefix", category: "noun.class.3" },
    "noun.class.4": { affix: ["m", "i"], position: "prefix", category: "noun.class.4" },
    "noun.class.5": { affix: ["i"], position: "prefix", category: "noun.class.5" },
    "noun.class.6": { affix: ["m", "a"], position: "prefix", category: "noun.class.6" },
    "noun.class.7": { affix: ["k", "i"], position: "prefix", category: "noun.class.7" },
    "noun.class.8": { affix: ["v", "i"], position: "prefix", category: "noun.class.8" },
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

export function presetBantu(): SimulationConfig {
  const base = defaultConfig();
  return {
    ...base,
    seed: "bantu",
    seedLexicon: LEXICON,
    seedFrequencyHints: FREQ,
    seedMorphology: MORPHOLOGY,
    // Bantu typology: SVO; no articles (definiteness via noun-class
    // prefixes); preposition strategy; pre-noun adjectives in Swahili
    // ("kitabu kikubwa" — but we keep adj=pre as a coarse default);
    // post-noun possessor ("kitabu cha mtoto").
    // Most Bantu languages have penultimate-syllable stress (with
    // length / tone interactions). Penult is the right approximation.
    seedStressPattern: "penult",
    seedGrammar: {
      wordOrder: "SVO",
      articlePresence: "none",
      caseStrategy: "preposition",
      adjectivePosition: "post",
      possessorPosition: "post",
    },
    preset: "bantu",
    // Bantu starts with tones already active via tone-bearing vowels in the lexicon.
  };
}
