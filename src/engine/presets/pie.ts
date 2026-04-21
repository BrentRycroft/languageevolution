import type { SimulationConfig, Lexicon, Meaning } from "../types";
import type { Morphology } from "../morphology/types";
import { defaultConfig } from "../config";

const LEXICON: Lexicon = {
  water: ["w", "o", "d", "r̥"],
  fire: ["p", "eː", "h₂", "w", "r̥"],
  stone: ["a", "ḱ", "m", "eː", "n"],
  mother: ["m", "a", "h₂", "t", "eː", "r"],
  father: ["p", "h₂", "t", "eː", "r"],
  night: ["n", "ó", "k", "w", "t", "s"],
  tree: ["d", "r", "éw", "h₂"],
  sun: ["s", "áh₂", "w", "e", "l"],
  moon: ["m", "éh₁", "n"],
  star: ["h₂", "s", "t", "ér"],
  two: ["d", "w", "oh₁"],
  three: ["t", "r", "éy", "e", "s"],
  hand: ["ǵ", "h", "e", "s", "r"],
  foot: ["p", "ó", "d", "s"],
  heart: ["ḱ", "ér", "d"],
  head: ["k", "a", "p", "u", "t"],
  eye: ["h₃", "o", "k", "w"],
  ear: ["h₂", "ow", "s"],
  mouth: ["h₁", "o", "ss"],
  tooth: ["h₁", "d", "ó", "n", "t"],
  bone: ["h₃", "o", "s", "t"],
  blood: ["k", "r", "éw", "h₂"],
  hair: ["p", "u", "l"],
  dog: ["ḱ", "w", "ó", "n"],
  wolf: ["w", "l̥", "k", "w", "o"],
  horse: ["h₁", "é", "ḱ", "w", "o", "s"],
  cow: ["g", "w", "óh₃", "w", "s"],
  fish: ["p", "i", "s", "ḱ"],
  bird: ["h₂", "ew", "i"],
  snake: ["s", "e", "r", "p"],
  go: ["g", "w", "e", "m"],
  come: ["g", "w", "e", "m"],
  see: ["w", "ei", "d"],
  know: ["ǵ", "n", "eh₃"],
  eat: ["h₁", "e", "d"],
  drink: ["p", "i", "h₃"],
  sleep: ["s", "w", "e", "p"],
  die: ["m", "e", "r"],
  one: ["ó", "y", "n", "o", "s"],
  big: ["m", "é", "ǵ", "h₂"],
  small: ["p", "a", "u"],
  new: ["n", "éw", "o", "s"],
  old: ["s", "e", "n"],
  good: ["d", "u̯", "é", "n"],
  bad: ["d", "u", "s"],
};

const FREQ: Record<Meaning, number> = {
  water: 0.95, fire: 0.8, mother: 0.9, father: 0.9,
  eye: 0.9, foot: 0.9, hand: 0.9, heart: 0.8,
  go: 0.95, come: 0.95, eat: 0.95, see: 0.95, one: 0.98, two: 0.95,
};

const MORPHOLOGY: Morphology = {
  paradigms: {
    "noun.case.nom": { affix: ["s"], position: "suffix", category: "noun.case.nom" },
    "noun.case.acc": { affix: ["m"], position: "suffix", category: "noun.case.acc" },
    "noun.case.gen": { affix: ["e", "s"], position: "suffix", category: "noun.case.gen" },
    "noun.case.dat": { affix: ["e", "y"], position: "suffix", category: "noun.case.dat" },
    "noun.case.loc": { affix: ["i"], position: "suffix", category: "noun.case.loc" },
    "noun.num.pl": { affix: ["e", "s"], position: "suffix", category: "noun.num.pl" },
    "verb.tense.past": { affix: ["e"], position: "prefix", category: "verb.tense.past" },
    "verb.aspect.pfv": { affix: ["e"], position: "suffix", category: "verb.aspect.pfv" },
    "verb.aspect.ipfv": { affix: ["y", "o"], position: "suffix", category: "verb.aspect.ipfv" },
  },
};

export function presetPIE(): SimulationConfig {
  const base = defaultConfig();
  return {
    ...base,
    seed: "pie",
    seedLexicon: LEXICON,
    seedFrequencyHints: FREQ,
    seedMorphology: MORPHOLOGY,
    preset: "pie",
  };
}
