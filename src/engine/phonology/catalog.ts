import type { SoundChange, WordForm, Phoneme } from "../types";
import { isVowel, isConsonant } from "./ipa";

type Mapping = readonly (readonly [Phoneme, Phoneme])[];

function countSites(
  word: WordForm,
  predicate: (p: Phoneme, i: number, w: WordForm) => boolean,
): number {
  let n = 0;
  for (let i = 0; i < word.length; i++) {
    if (predicate(word[i]!, i, word)) n++;
  }
  return n;
}

function pickSite(
  word: WordForm,
  predicate: (p: Phoneme, i: number, w: WordForm) => boolean,
  rng: { int: (n: number) => number },
): number {
  const sites: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (predicate(word[i]!, i, word)) sites.push(i);
  }
  if (sites.length === 0) return -1;
  return sites[rng.int(sites.length)]!;
}

function simpleSub(
  id: string,
  label: string,
  category: SoundChange["category"],
  from: Phoneme,
  to: Phoneme,
  perSiteProb: number,
  description: string,
): SoundChange {
  return {
    id,
    label,
    category,
    description,
    probabilityFor: (w) => 1 - Math.pow(1 - perSiteProb, countSites(w, (p) => p === from)),
    apply: (word, rng) => {
      const idx = pickSite(word, (p) => p === from, rng);
      if (idx < 0) return word;
      const out = word.slice();
      out[idx] = to;
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  };
}

function contextSub(
  id: string,
  label: string,
  category: SoundChange["category"],
  from: Phoneme,
  to: Phoneme,
  ctx: (p: Phoneme, i: number, w: WordForm) => boolean,
  perSiteProb: number,
  description: string,
): SoundChange {
  const pred = (p: Phoneme, i: number, w: WordForm) => p === from && ctx(p, i, w);
  return {
    id,
    label,
    category,
    description,
    probabilityFor: (w) => 1 - Math.pow(1 - perSiteProb, countSites(w, pred)),
    apply: (word, rng) => {
      const idx = pickSite(word, pred, rng);
      if (idx < 0) return word;
      const out = word.slice();
      out[idx] = to;
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  };
}

function mappingSub(
  id: string,
  label: string,
  category: SoundChange["category"],
  mapping: Mapping,
  perSiteProb: number,
  description: string,
): SoundChange {
  const m = new Map(mapping);
  const pred = (p: Phoneme) => m.has(p);
  return {
    id,
    label,
    category,
    description,
    probabilityFor: (w) => 1 - Math.pow(1 - perSiteProb, countSites(w, pred)),
    apply: (word, rng) => {
      const idx = pickSite(word, pred, rng);
      if (idx < 0) return word;
      const out = word.slice();
      out[idx] = m.get(word[idx]!)!;
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  };
}

export const CATALOG: SoundChange[] = [
  simpleSub(
    "lenition.p_to_f",
    "p → f",
    "lenition",
    "p",
    "f",
    0.08,
    "Voiceless bilabial stop becomes fricative.",
  ),
  simpleSub(
    "lenition.t_to_theta",
    "t → θ",
    "lenition",
    "t",
    "θ",
    0.06,
    "Voiceless alveolar stop becomes dental fricative.",
  ),
  contextSub(
    "lenition.k_to_h_before_V",
    "k → h / _V",
    "lenition",
    "k",
    "h",
    (_p, i, w) => i + 1 < w.length && isVowel(w[i + 1]!),
    0.08,
    "k debuccalizes to h before a vowel.",
  ),
  mappingSub(
    "devoicing.bdg",
    "b/d/g → p/t/k",
    "fortition",
    [
      ["b", "p"],
      ["d", "t"],
      ["g", "k"],
    ],
    0.05,
    "Voiced stops devoice.",
  ),
  {
    id: "voicing.s_intervocalic",
    label: "s → z / V_V",
    category: "voicing",
    description: "s voices between vowels.",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 1; i < w.length - 1; i++) {
        if (w[i] === "s" && isVowel(w[i - 1]!) && isVowel(w[i + 1]!)) n++;
      }
      return 1 - Math.pow(1 - 0.08, n);
    },
    apply: (word, rng) => {
      const pred = (p: Phoneme, i: number, w: WordForm) =>
        p === "s" && i > 0 && i < w.length - 1 && isVowel(w[i - 1]!) && isVowel(w[i + 1]!);
      const idx = pickSite(word, pred, rng);
      if (idx < 0) return word;
      const out = word.slice();
      out[idx] = "z";
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "deletion.final_vowel",
    label: "V → ∅ / _#",
    category: "deletion",
    description: "Drop word-final vowel (if word would remain >= 2 phonemes).",
    probabilityFor: (w) => (w.length >= 3 && isVowel(w[w.length - 1]!) ? 0.07 : 0),
    apply: (word) => {
      if (word.length < 3) return word;
      if (!isVowel(word[word.length - 1]!)) return word;
      return word.slice(0, -1);
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  mappingSub(
    "vowel.raising_a_eh",
    "a → ɛ, ɛ → i",
    "vowel",
    [
      ["a", "ɛ"],
      ["ɛ", "i"],
    ],
    0.04,
    "Chain-shift raising of open vowels.",
  ),
  {
    id: "deletion.initial_cluster",
    label: "CC → C / #_",
    category: "deletion",
    description: "Simplify word-initial consonant cluster.",
    probabilityFor: (w) => (w.length >= 2 && isConsonant(w[0]!) && isConsonant(w[1]!) ? 0.08 : 0),
    apply: (word) => {
      if (word.length < 2) return word;
      if (!(isConsonant(word[0]!) && isConsonant(word[1]!))) return word;
      return word.slice(1);
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "assimilation.n_before_labial_velar",
    label: "n → m/ŋ (assim.)",
    category: "assimilation",
    description: "n assimilates in place before p/b (→m) or k/g (→ŋ).",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 1; i++) {
        if (w[i] === "n") {
          const nx = w[i + 1];
          if (nx === "p" || nx === "b" || nx === "k" || nx === "g") n++;
        }
      }
      return 1 - Math.pow(1 - 0.1, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 1; i++) {
        if (word[i] === "n") {
          const nx = word[i + 1];
          if (nx === "p" || nx === "b" || nx === "k" || nx === "g") sites.push(i);
        }
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const nx = word[idx + 1]!;
      const out = word.slice();
      out[idx] = nx === "p" || nx === "b" ? "m" : "ŋ";
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "deletion.h_initial",
    label: "h → ∅ / #_",
    category: "deletion",
    description: "Drop word-initial h.",
    probabilityFor: (w) => (w.length > 1 && w[0] === "h" ? 0.05 : 0),
    apply: (word) => (word[0] === "h" && word.length > 1 ? word.slice(1) : word),
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "palatalization.k_before_front_V",
    label: "k → tʃ / _i,e",
    category: "palatalization",
    description: "k palatalizes before front vowels.",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 1; i++) {
        if (w[i] === "k" && (w[i + 1] === "i" || w[i + 1] === "e" || w[i + 1] === "iː" || w[i + 1] === "eː")) n++;
      }
      return 1 - Math.pow(1 - 0.09, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 1; i++) {
        if (word[i] === "k" && (word[i + 1] === "i" || word[i + 1] === "e" || word[i + 1] === "iː" || word[i + 1] === "eː")) sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = "tʃ";
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "vowel.lengthening_open_syllable",
    label: "V → Vː / _C#",
    category: "vowel",
    description: "Lengthen final stressed vowel before single consonant.",
    probabilityFor: (w) => {
      if (w.length < 3) return 0;
      const last = w[w.length - 1]!;
      const prev = w[w.length - 2]!;
      if (isConsonant(last) && isVowel(prev) && !prev.endsWith("ː")) return 0.04;
      return 0;
    },
    apply: (word) => {
      if (word.length < 3) return word;
      const last = word[word.length - 1]!;
      const prev = word[word.length - 2]!;
      if (!(isConsonant(last) && isVowel(prev) && !prev.endsWith("ː"))) return word;
      const lengthened = prev + "ː";
      const out = word.slice();
      out[out.length - 2] = lengthened;
      return out;
    },
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "metathesis.r_swap",
    label: "VrC → rVC",
    category: "metathesis",
    description: "Metathesis of r with preceding vowel in VrC clusters.",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 2; i++) {
        if (isVowel(w[i]!) && w[i + 1] === "r" && isConsonant(w[i + 2]!)) n++;
      }
      return 1 - Math.pow(1 - 0.03, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 2; i++) {
        if (isVowel(word[i]!) && word[i + 1] === "r" && isConsonant(word[i + 2]!)) sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      const v = out[idx]!;
      out[idx] = "r";
      out[idx + 1] = v;
      return out;
    },
    enabledByDefault: false,
    baseWeight: 1,
  },
  contextSub(
    "lenition.v_intervocalic",
    "v → w / V_V",
    "lenition",
    "v",
    "w",
    (_p, i, w) => i > 0 && i < w.length - 1 && isVowel(w[i - 1]!) && isVowel(w[i + 1]!),
    0.05,
    "v glides to w between vowels.",
  ),
];

export const CATALOG_BY_ID: Record<string, SoundChange> = Object.fromEntries(
  CATALOG.map((c) => [c.id, c]),
);
