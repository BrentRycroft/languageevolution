import type { Lexicon } from "../types";
import { fillMissing, type FormPhonology } from "./basic240";

const DEFAULT_PHONOLOGY: FormPhonology = {
  onsets: ["p", "t", "k", "b", "d", "g", "m", "n", "s", "l", "r", "w", "j", "h", "f"],
  vowels: ["a", "e", "i", "o", "u"],
  codas: ["n", "s", "t", "l", "r", "k"],
  minSyllables: 2,
  maxSyllables: 3,
};

const CORE: Lexicon = {
  water: ["w", "a", "t", "e", "r"],
  fire: ["p", "u", "r"],
  stone: ["s", "t", "a", "n"],
  mother: ["m", "a", "t", "e", "r"],
  father: ["p", "a", "t", "e", "r"],
  night: ["n", "o", "k", "t"],
  tree: ["t", "r", "e"],
  sun: ["s", "u", "n"],
  moon: ["m", "e", "n"],
  star: ["s", "t", "e", "r"],
  two: ["d", "w", "o"],
  three: ["t", "r", "i"],
  hand: ["k", "a", "n", "t"],
  foot: ["p", "o", "d"],
  heart: ["k", "e", "r", "d"],
  head: ["k", "a", "p", "u", "t"],
  eye: ["o", "k"],
  ear: ["a", "u", "s"],
  mouth: ["o", "s"],
  tooth: ["d", "e", "n", "t"],
  bone: ["o", "s", "t"],
  blood: ["k", "r", "u"],
  hair: ["p", "i", "l"],
  dog: ["k", "u", "n"],
  wolf: ["w", "u", "l", "k"],
  horse: ["e", "k", "w", "o"],
  cow: ["g", "w", "o"],
  fish: ["p", "i", "s", "k"],
  bird: ["a", "w", "i"],
  snake: ["s", "e", "r", "p"],
  go: ["g", "a", "n"],
  come: ["g", "w", "e", "m"],
  see: ["w", "i", "d"],
  know: ["g", "n", "o"],
  eat: ["e", "d"],
  drink: ["p", "i"],
  sleep: ["s", "w", "e", "p"],
  die: ["m", "o", "r"],
  one: ["o", "i", "n"],
  big: ["m", "a", "g"],
  small: ["p", "a", "u"],
  new: ["n", "e", "w"],
  old: ["s", "e", "n"],
  good: ["b", "o", "n"],
  bad: ["m", "a", "l"],
};

export const DEFAULT_LEXICON: Lexicon = fillMissing(CORE, DEFAULT_PHONOLOGY);

export { DEFAULT_PHONOLOGY };
