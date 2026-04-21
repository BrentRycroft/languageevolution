import type { SimulationConfig, Lexicon, Meaning } from "../types";
import type { Morphology } from "../morphology/types";
import { defaultConfig } from "../config";

// Proto-Germanic: PIE after Grimm's Law (p→f, t→θ, k→h, b→p, d→t, g→k).
const LEXICON: Lexicon = {
  water: ["w", "a", "t", "a", "r"],
  fire: ["f", "u", "r"],
  stone: ["s", "t", "a", "i", "n", "a", "z"],
  mother: ["m", "ō", "t", "ē", "r"],
  father: ["f", "a", "ð", "ē", "r"],
  night: ["n", "a", "h", "t"],
  tree: ["b", "a", "g", "m", "a"],
  sun: ["s", "u", "n", "n", "ō"],
  moon: ["m", "ē", "n", "ō"],
  star: ["s", "t", "e", "r", "n", "ō"],
  two: ["t", "w", "a", "i"],
  three: ["θ", "r", "ī", "z"],
  hand: ["h", "a", "n", "d", "u", "z"],
  foot: ["f", "ō", "t", "s"],
  heart: ["h", "e", "r", "t", "ō"],
  head: ["h", "a", "u", "β", "u", "ð"],
  eye: ["a", "u", "g", "ō"],
  ear: ["a", "u", "s", "ō"],
  mouth: ["m", "u", "n", "θ", "a", "z"],
  tooth: ["t", "a", "n", "θ", "s"],
  bone: ["b", "a", "i", "n", "a"],
  blood: ["b", "l", "ō", "θ", "a"],
  hair: ["h", "ē", "r"],
  dog: ["h", "u", "n", "d", "a", "z"],
  wolf: ["w", "u", "l", "f", "a", "z"],
  horse: ["h", "r", "u", "s", "s", "a"],
  cow: ["k", "ū", "z"],
  fish: ["f", "i", "s", "k", "a", "z"],
  bird: ["f", "u", "g", "l", "a", "z"],
  snake: ["w", "u", "r", "m", "i", "z"],
  go: ["g", "a", "n", "g"],
  come: ["k", "w", "e", "m"],
  see: ["s", "e", "h", "w"],
  know: ["k", "u", "n", "n"],
  eat: ["e", "t"],
  drink: ["d", "r", "i", "n", "k"],
  sleep: ["s", "l", "ē", "p"],
  die: ["d", "a", "u", "þ"],
  one: ["a", "i", "n", "a", "z"],
  big: ["m", "i", "k", "i", "l"],
  small: ["l", "ī", "t", "i", "l"],
  new: ["n", "i", "u", "j", "a", "z"],
  old: ["a", "l", "d", "a", "z"],
  good: ["g", "ō", "d", "a", "z"],
  bad: ["u", "β", "i", "l", "a", "z"],
};

const FREQ: Record<Meaning, number> = {
  water: 0.95, fire: 0.85, mother: 0.9, father: 0.9,
  go: 0.95, come: 0.95, eat: 0.95, drink: 0.9, see: 0.95,
};

const MORPHOLOGY: Morphology = {
  paradigms: {
    "noun.case.nom": { affix: ["a", "z"], position: "suffix", category: "noun.case.nom" },
    "noun.case.acc": { affix: ["a", "n"], position: "suffix", category: "noun.case.acc" },
    "noun.case.gen": { affix: ["e", "s"], position: "suffix", category: "noun.case.gen" },
    "noun.case.dat": { affix: ["i"], position: "suffix", category: "noun.case.dat" },
    "noun.num.pl": { affix: ["ō", "z"], position: "suffix", category: "noun.num.pl" },
    "verb.tense.past": { affix: ["d", "a"], position: "suffix", category: "verb.tense.past" },
    "verb.person.3sg": { affix: ["θ", "i"], position: "suffix", category: "verb.person.3sg" },
  },
};

export function presetGermanic(): SimulationConfig {
  const base = defaultConfig();
  return {
    ...base,
    seed: "germanic",
    seedLexicon: LEXICON,
    seedFrequencyHints: FREQ,
    seedMorphology: MORPHOLOGY,
    preset: "germanic",
  };
}
