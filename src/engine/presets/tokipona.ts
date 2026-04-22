import type { SimulationConfig, Lexicon, Meaning } from "../types";
import type { Morphology } from "../morphology/types";
import { defaultConfig } from "../config";

/**
 * Toki pona preset — the famously minimal constructed language.
 *
 * ~120 root words, phonology limited to {a e i o u} + {p t k s m n l j w},
 * SVO, no tense marking, no case, no gender, no paradigms. Conservatism
 * set slightly above average since the community actively preserves the
 * minimalist character.
 *
 * The mapping from toki pona roots to Basic-240 meanings is opinionated
 * — toki pona's words are famously abstract ("pona" = good / simple /
 * correct) so there's no clean 1:1 match. We pick the most conventional
 * gloss and let semantic drift + the procedural engine take it from there.
 */

const LEXICON: Lexicon = {
  // Environment
  water: ["t", "e", "l", "o"],      // telo
  fire: ["s", "e", "l", "i"],       // seli
  stone: ["k", "i", "w", "e", "n"], // kiwen
  tree: ["k", "a", "s", "i"],       // kasi
  sun: ["s", "u", "n", "o"],        // suno
  moon: ["m", "u", "n"],            // mun
  star: ["m", "u", "n"],            // mun (reused)
  night: ["p", "i", "m", "e", "j", "a"], // pimeja
  day: ["s", "u", "n", "o"],        // suno (reused)
  sky: ["s", "e", "w", "i"],        // sewi
  earth: ["m", "a"],                // ma
  sea: ["t", "e", "l", "o"],        // telo (reused)

  // Body
  head: ["l", "a", "w", "a"],       // lawa
  eye: ["l", "u", "k", "i", "n"],   // lukin
  mouth: ["u", "t", "a"],           // uta
  ear: ["k", "u", "t", "e"],        // kute
  hand: ["l", "u", "k", "a"],       // luka
  foot: ["n", "o", "k", "a"],       // noka
  body: ["s", "i", "j", "e", "l", "o"], // sijelo
  skin: ["s", "e", "l", "o"],       // selo
  bone: ["k", "i", "w", "e", "n"],  // kiwen (reused)
  blood: ["t", "e", "l", "o"],      // telo (reused)
  hair: ["l", "i", "n", "j", "a"],  // linja
  nose: ["n", "e", "n", "a"],       // nena
  heart: ["p", "i", "l", "i", "n"], // pilin

  // Kinship / person
  mother: ["m", "a", "m", "a"],     // mama
  father: ["m", "a", "m", "a"],     // mama (same)
  child: ["j", "a", "n"],           // jan (person)
  friend: ["j", "a", "n"],          // jan
  wife: ["m", "e", "l", "i"],       // meli
  husband: ["m", "i", "j", "e"],    // mije

  // Actions
  go: ["t", "a", "w", "a"],         // tawa
  come: ["t", "a", "w", "a"],       // tawa (reused)
  see: ["l", "u", "k", "i", "n"],   // lukin
  know: ["s", "o", "n", "a"],       // sona
  eat: ["m", "o", "k", "u"],        // moku
  drink: ["m", "o", "k", "u"],      // moku (reused)
  sleep: ["l", "a", "p", "e"],      // lape
  die: ["m", "o", "l", "i"],        // moli
  speak: ["t", "o", "k", "i"],      // toki
  hear: ["k", "u", "t", "e"],       // kute (reused)
  fight: ["u", "t", "a", "l", "a"], // utala
  work: ["p", "a", "l", "i"],       // pali
  give: ["p", "a", "n", "a"],       // pana
  open: ["o", "p", "e", "n"],       // open
  stay: ["a", "w", "e", "n"],       // awen

  // Animals
  dog: ["s", "o", "w", "e", "l", "i"],  // soweli
  cow: ["s", "o", "w", "e", "l", "i"],  // soweli
  wolf: ["s", "o", "w", "e", "l", "i"], // soweli
  horse: ["s", "o", "w", "e", "l", "i"],
  fish: ["k", "a", "l", "a"],       // kala
  bird: ["w", "a", "s", "o"],       // waso
  snake: ["p", "i", "p", "i"],      // pipi
  cat: ["s", "o", "w", "e", "l", "i"],
  bear: ["s", "o", "w", "e", "l", "i"],

  // Plants
  flower: ["k", "a", "s", "i"],     // kasi
  fruit: ["k", "i", "l", "i"],      // kili
  seed: ["k", "i", "l", "i"],       // kili
  leaf: ["l", "i", "p", "u"],       // lipu

  // Quality
  good: ["p", "o", "n", "a"],       // pona
  bad: ["i", "k", "e"],             // ike
  big: ["s", "u", "l", "i"],        // suli
  small: ["l", "i", "l", "i"],      // lili
  new: ["s", "i", "n"],             // sin
  old: ["m", "a", "j", "u"],        // majuna (shortened)
  hot: ["s", "e", "l", "i"],        // seli (reused)
  cold: ["l", "e", "t", "e"],       // lete
  hard: ["k", "i", "w", "e", "n"],  // kiwen
  soft: ["k", "o"],                 // ko
  strong: ["w", "a", "w", "a"],     // wawa
  weak: ["m", "a", "j", "u"],       // majuna
  long: ["l", "i", "n", "j", "a"],  // linja
  short: ["l", "i", "l", "i"],      // lili

  // Pronouns
  i: ["m", "i"],                    // mi
  you: ["s", "i", "n", "a"],        // sina
  they: ["o", "n", "a"],            // ona
  we: ["m", "i"],                   // mi (plural by context)
  "he-she": ["o", "n", "a"],        // ona
  this: ["n", "i"],                 // ni
  that: ["n", "i"],                 // ni

  // Numbers
  one: ["w", "a", "n"],             // wan
  two: ["t", "u"],                  // tu
  three: ["m", "u", "t", "e"],      // mute (many)
  many: ["m", "u", "t", "e"],       // mute
  few: ["l", "i", "l", "i"],        // lili

  // Abstract / cultural
  name: ["n", "i", "m", "i"],       // nimi
  word: ["n", "i", "m", "i"],       // nimi
  song: ["k", "a", "l", "a", "m", "a"], // kalama
  home: ["t", "o", "m", "o"],       // tomo
  village: ["m", "a"],              // ma
  road: ["n", "a", "s", "i", "n"],  // nasin
  love: ["o", "l", "i", "n"],       // olin
  war: ["u", "t", "a", "l", "a"],   // utala
  free: ["k", "e"],                 // ke? ~ just a placeholder
  spirit: ["k", "o", "n"],          // kon
  god: ["s", "e", "w", "i"],        // sewi
  law: ["l", "a", "w", "a"],        // lawa (extended)
  gift: ["p", "a", "n", "a"],       // pana
  story: ["t", "o", "k", "i"],      // toki
};

/** Per-meaning default frequency hint. Toki pona has no "rare" words to
 *  speak of; the ~120 roots each do a lot of work. */
const FREQ: Record<Meaning, number> = {
  i: 0.98, you: 0.98, good: 0.95, bad: 0.9,
  water: 0.9, fire: 0.85, eat: 0.9, see: 0.9,
  big: 0.85, small: 0.85, speak: 0.9,
};

/** Toki pona has no inflectional morphology. */
const MORPHOLOGY: Morphology = { paradigms: {} };

/**
 * Bias the procedural generator toward minimal change. Halves lenition
 * and fortition; zeroes tone and metathesis; leaves vowel shifts and
 * palatalisation near default so the language can still drift in flavour.
 */
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
    preset: "tokipona",
  };
}

export { RULE_BIAS as TOKIPONA_RULE_BIAS };
