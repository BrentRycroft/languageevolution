import type { SimulationConfig, Lexicon, Meaning } from "../types";
import type { Morphology } from "../morphology/types";
import { defaultConfig } from "../config";

// Proto-Bantu (highly simplified): CV syllables, noun-class prefixes, tone.
// Tones: ˥ high, ˩ low. Class prefixes encoded in the meaning's base form.
const LEXICON: Lexicon = {
  water: ["m", "a", "ⁿ", "j", "i"],
  fire: ["m", "u", "ó", "t", "ó"],
  stone: ["i", "ǂ", "b", "u", "è"],
  mother: ["m", "a", "m", "a"],
  father: ["t", "a", "t", "a"],
  night: ["b", "u", "s", "i", "k", "u"],
  tree: ["m", "u˥", "t", "i"],
  sun: ["j", "u", "b", "a"],
  moon: ["m", "w", "è", "z", "i"],
  star: ["ɲ", "i", "è", "ɲ", "i", "è", "n", "i", "è"],
  two: ["b", "i", "l", "i"],
  three: ["t", "a", "t", "u"],
  hand: ["m", "u", "k", "ò", "n", "o"],
  foot: ["m", "u", "à", "g", "u", "l", "u"],
  heart: ["m", "o", "ó", "j", "o"],
  head: ["m", "u˥", "t", "w", "e"],
  eye: ["i", "j", "i", "s", "o"],
  ear: ["k", "u", "t", "w", "i"],
  mouth: ["m", "u", "l", "o", "m", "o"],
  tooth: ["i", "j", "i", "n", "o"],
  bone: ["i", "k", "u", "p", "a"],
  blood: ["m", "u", "g", "a", "z", "i"],
  hair: ["l", "u", "s", "o", "k", "o"],
  dog: ["m", "b", "u", "à"],
  wolf: ["i", "m", "b", "u", "à"],
  horse: ["i", "f", "a", "r", "a", "s", "i"],
  cow: ["ɲ", "o", "m", "b", "e"],
  fish: ["i", "s", "a", "m", "a", "k", "i"],
  bird: ["ⁿ", "j", "u", "ni"],
  snake: ["ɲ", "o", "k", "a"],
  go: ["e", "n", "d", "a"],
  come: ["j", "a"],
  see: ["o", "n", "a"],
  know: ["j", "u", "a"],
  eat: ["l", "i", "a"],
  drink: ["ɲ", "w", "a"],
  sleep: ["l", "a", "l", "a"],
  die: ["f", "u", "a"],
  one: ["m", "ò", "j", "a"],
  big: ["k", "u", "l", "u"],
  small: ["d", "o", "k", "o"],
  new: ["ɲ", "i", "a"],
  old: ["z", "a", "b", "e"],
  good: ["t", "a", "m", "u"],
  bad: ["b", "i", "b", "i"],
};

const FREQ: Record<Meaning, number> = {
  water: 0.95, fire: 0.9, mother: 0.95, father: 0.95,
  eat: 0.95, go: 0.95, come: 0.95, see: 0.95, drink: 0.95, sleep: 0.9,
};

const MORPHOLOGY: Morphology = {
  paradigms: {
    // Bantu-style noun-class prefixes + concord markers.
    "noun.num.pl": { affix: ["b", "a"], position: "prefix", category: "noun.num.pl" },
    "verb.tense.past": { affix: ["a"], position: "prefix", category: "verb.tense.past" },
    "verb.tense.fut": { affix: ["t", "a"], position: "prefix", category: "verb.tense.fut" },
    "verb.aspect.pfv": { affix: ["i", "l", "e"], position: "suffix", category: "verb.aspect.pfv" },
    "verb.aspect.ipfv": { affix: ["a", "g", "a"], position: "suffix", category: "verb.aspect.ipfv" },
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
    preset: "bantu",
    // Bantu starts with tones already active via tone-bearing vowels in the lexicon.
  };
}
