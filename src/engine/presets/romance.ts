import type { SimulationConfig, Lexicon, Meaning } from "../types";
import type { Morphology } from "../morphology/types";
import { defaultConfig } from "../config";

// Late Latin / Proto-Romance: 5-case system in mid-collapse, SVO emerging.
const LEXICON: Lexicon = {
  water: ["a", "k", "w", "a"],
  fire: ["f", "o", "k", "u"],
  stone: ["p", "e", "t", "r", "a"],
  mother: ["m", "a", "t", "r", "e"],
  father: ["p", "a", "t", "r", "e"],
  night: ["n", "o", "k", "t", "e"],
  tree: ["a", "r", "b", "o", "r", "e"],
  sun: ["s", "o", "l", "e"],
  moon: ["l", "u", "n", "a"],
  star: ["s", "t", "e", "l", "l", "a"],
  two: ["d", "u", "o"],
  three: ["t", "r", "e", "s"],
  hand: ["m", "a", "n", "u"],
  foot: ["p", "e", "d", "e"],
  heart: ["k", "o", "r"],
  head: ["k", "a", "p", "u", "t"],
  eye: ["o", "k", "u", "l", "u"],
  ear: ["a", "u", "r", "i", "s"],
  mouth: ["b", "o", "k", "k", "a"],
  tooth: ["d", "e", "n", "t", "e"],
  bone: ["o", "s", "s", "u"],
  blood: ["s", "a", "n", "g", "w", "e"],
  hair: ["k", "a", "p", "i", "l", "l", "u"],
  dog: ["k", "a", "n", "e"],
  wolf: ["l", "u", "p", "u"],
  horse: ["k", "a", "b", "a", "l", "l", "u"],
  cow: ["b", "o", "v", "e"],
  fish: ["p", "i", "s", "k", "e"],
  bird: ["a", "w", "i", "k", "e", "l", "l", "u"],
  snake: ["s", "e", "r", "p", "e", "n", "t", "e"],
  go: ["i", "r"],
  come: ["w", "e", "n", "i", "r"],
  see: ["w", "i", "d", "e", "r"],
  know: ["s", "k", "i", "r", "e"],
  eat: ["k", "o", "m", "e", "d", "e", "r"],
  drink: ["b", "i", "b", "e", "r", "e"],
  sleep: ["d", "o", "r", "m", "i", "r"],
  die: ["m", "o", "r", "i", "r"],
  one: ["u", "n", "u"],
  big: ["g", "r", "a", "n", "d", "e"],
  small: ["p", "i", "k", "k", "u", "l", "u"],
  new: ["n", "o", "w", "u"],
  old: ["w", "e", "t", "u", "l", "u"],
  good: ["b", "o", "n", "u"],
  bad: ["m", "a", "l", "u"],
};

const FREQ: Record<Meaning, number> = {
  water: 0.95, fire: 0.85, mother: 0.9, father: 0.9,
  go: 0.95, eat: 0.95, drink: 0.95, see: 0.95, sleep: 0.9,
};

const MORPHOLOGY: Morphology = {
  paradigms: {
    "noun.case.nom": { affix: ["u", "s"], position: "suffix", category: "noun.case.nom" },
    "noun.case.acc": { affix: ["u", "m"], position: "suffix", category: "noun.case.acc" },
    "noun.case.gen": { affix: ["ī"], position: "suffix", category: "noun.case.gen" },
    "noun.case.dat": { affix: ["ō"], position: "suffix", category: "noun.case.dat" },
    "noun.num.pl": { affix: ["ī"], position: "suffix", category: "noun.num.pl" },
    "verb.tense.past": { affix: ["ā", "β", "a", "m"], position: "suffix", category: "verb.tense.past" },
    "verb.tense.fut": { affix: ["ā", "β", "o"], position: "suffix", category: "verb.tense.fut" },
    "verb.person.3sg": { affix: ["t"], position: "suffix", category: "verb.person.3sg" },
  },
};

export function presetRomance(): SimulationConfig {
  const base = defaultConfig();
  return {
    ...base,
    seed: "romance",
    seedLexicon: LEXICON,
    seedFrequencyHints: FREQ,
    seedMorphology: MORPHOLOGY,
    preset: "romance",
  };
}
