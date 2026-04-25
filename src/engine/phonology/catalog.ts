import type { SoundChange, WordForm, Phoneme } from "../types";
import { isVowel, isConsonant, isSyllabic } from "./ipa";
import { HIGH, LOW, stripTone, toneOf } from "./tone";
import { UNSTRESSED_REDUCTION } from "./stress";

const CLICKS = ["ǀ", "ǃ", "ǂ", "ǁ"] as const;
const VOICED = new Set(["b", "d", "g", "v", "z", "ʒ", "dʒ", "dz"]);
const VOICELESS = new Set(["p", "t", "k", "f", "s", "ʃ", "tʃ", "ts", "θ"]);

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
    description: "Drop word-final vowel (if a nucleus still remains).",
    probabilityFor: (w) => {
      // Minimum word-length floor for content words. Without this
      // every apocope cycle eats the word until it hits the
      // hard-floor in `wordShape.isFormLegal` (length 2). Bumping
      // the per-word floor to 4 keeps the surface lengths in the
      // 3-6 range that's typical for attested content words.
      if (w.length < 4) return 0;
      if (!isVowel(w[w.length - 1]!)) return 0;
      // Block deletion if the final vowel is the last remaining nucleus
      // — otherwise the word collapses to an all-consonant form like
      // `dw`, which `isFormLegal` later rejects anyway. Catching it
      // here keeps the probability budget honest and prevents
      // deterministic RNG waste on always-rejected outcomes.
      const remainder = w.slice(0, -1);
      if (!remainder.some((p) => isSyllabic(p))) return 0;
      return 0.07;
    },
    apply: (word) => {
      if (word.length < 3) return word;
      if (!isVowel(word[word.length - 1]!)) return word;
      const remainder = word.slice(0, -1);
      if (!remainder.some((p) => isSyllabic(p))) return word;
      return remainder;
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
    probabilityFor: (w) =>
      // Length floor: keep content words at ≥3 phonemes after the
      // reduction. Two-phoneme words are already at the legal
      // minimum and shouldn't get shorter.
      w.length >= 4 && isConsonant(w[0]!) && isConsonant(w[1]!) ? 0.08 : 0,
    apply: (word) => {
      if (word.length < 4) return word;
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

  {
    id: "insertion.prothetic_e",
    label: "∅ → e / #_sC",
    category: "insertion",
    positionBias: "initial",
    description:
      "Insert a prothetic e before word-initial s+C clusters (Latin scola → Spanish escuela).",
    probabilityFor: (w) =>
      w.length >= 2 && w[0] === "s" && isConsonant(w[1]!) ? 0.08 : 0,
    apply: (word) => (word[0] === "s" && word.length >= 2 && isConsonant(word[1]!) ? ["e", ...word] : word),
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "insertion.paragogic_vowel",
    label: "∅ → e / _C#",
    category: "insertion",
    positionBias: "final",
    description:
      "Append a final vowel after a word-final stop or fricative (nox → noche).",
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const last = w[w.length - 1]!;
      if (!isConsonant(last)) return 0;
      if (last === "n" || last === "l" || last === "r") return 0;
      return 0.05;
    },
    apply: (word) => [...word, "e"],
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "insertion.anaptyxis",
    label: "∅ → ə / C_C",
    category: "insertion",
    positionBias: "internal",
    description: "Break up heavy internal CC clusters with a schwa.",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 1; i < w.length - 1; i++) {
        if (isConsonant(w[i]!) && isConsonant(w[i + 1]!)) n++;
      }
      return 1 - Math.pow(1 - 0.04, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 1; i < word.length - 1; i++) {
        if (isConsonant(word[i]!) && isConsonant(word[i + 1]!)) sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      return [...word.slice(0, idx + 1), "ə", ...word.slice(idx + 1)];
    },
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "deletion.apheresis",
    label: "C → ∅ / #_",
    category: "deletion",
    positionBias: "initial",
    description: "Drop a word-initial single consonant (esquire → squire).",
    probabilityFor: (w) =>
      w.length >= 3 && isConsonant(w[0]!) && !isConsonant(w[1]!) ? 0.03 : 0,
    apply: (word) =>
      word.length >= 3 && isConsonant(word[0]!) && !isConsonant(word[1]!)
        ? word.slice(1)
        : word,
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "deletion.apocope",
    label: "C → ∅ / _#",
    category: "deletion",
    positionBias: "final",
    description: "Drop a word-final consonant.",
    probabilityFor: (w) =>
      w.length >= 3 && isConsonant(w[w.length - 1]!) ? 0.04 : 0,
    apply: (word) =>
      word.length >= 3 && isConsonant(word[word.length - 1]!)
        ? word.slice(0, -1)
        : word,
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "deletion.syncope",
    label: "V → ∅ / C_C",
    category: "deletion",
    positionBias: "internal",
    description: "Drop an internal unstressed vowel between two consonants.",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 1; i < w.length - 1; i++) {
        if (isVowel(w[i]!) && isConsonant(w[i - 1]!) && isConsonant(w[i + 1]!)) n++;
      }
      return 1 - Math.pow(1 - 0.03, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 1; i < word.length - 1; i++) {
        if (isVowel(word[i]!) && isConsonant(word[i - 1]!) && isConsonant(word[i + 1]!)) sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      return [...word.slice(0, idx), ...word.slice(idx + 1)];
    },
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "gemination.emphatic",
    label: "C → CC / V_V",
    category: "gemination",
    positionBias: "internal",
    description: "Double an intervocalic consonant (emphatic gemination).",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 1; i < w.length - 1; i++) {
        if (isConsonant(w[i]!) && isVowel(w[i - 1]!) && isVowel(w[i + 1]!)) n++;
      }
      return 1 - Math.pow(1 - 0.02, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 1; i < word.length - 1; i++) {
        if (isConsonant(word[i]!) && isVowel(word[i - 1]!) && isVowel(word[i + 1]!)) sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      return [...word.slice(0, idx + 1), word[idx]!, ...word.slice(idx + 1)];
    },
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "gemination.degemination",
    label: "CC → C",
    category: "gemination",
    description: "Collapse a double consonant to a single.",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 1; i++) {
        if (w[i] === w[i + 1] && isConsonant(w[i]!)) n++;
      }
      return 1 - Math.pow(1 - 0.06, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 1; i++) {
        if (word[i] === word[i + 1] && isConsonant(word[i]!)) sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      return [...word.slice(0, idx), ...word.slice(idx + 1)];
    },
    enabledByDefault: true,
    baseWeight: 1,
  },

  // --- Generative / cyclic rules ---
  // These deliberately re-introduce phonemes that one-way chain shifts remove,
  // keeping the inventory lively across long runs.

  {
    id: "monophthongization.au_to_o",
    label: "au → o / ai → e",
    category: "vowel",
    description: "Diphthongs collapse, re-seeding mid vowels lost to raising.",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 1; i++) {
        if ((w[i] === "a" && w[i + 1] === "u") || (w[i] === "a" && w[i + 1] === "i")) n++;
      }
      return 1 - Math.pow(1 - 0.06, n);
    },
    apply: (word, rng) => {
      const sites: Array<{ idx: number; to: Phoneme }> = [];
      for (let i = 0; i < word.length - 1; i++) {
        if (word[i] === "a" && word[i + 1] === "u") sites.push({ idx: i, to: "o" });
        else if (word[i] === "a" && word[i + 1] === "i") sites.push({ idx: i, to: "e" });
      }
      if (sites.length === 0) return word;
      const pick = sites[rng.int(sites.length)]!;
      return [...word.slice(0, pick.idx), pick.to, ...word.slice(pick.idx + 2)];
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  mappingSub(
    "vowel.lowering",
    "i → e, e → a",
    "vowel",
    [
      ["i", "e"],
      ["e", "a"],
    ],
    0.03,
    "Reverse-chain lowering: provides fresh vowels for the raising rule to act on again.",
  ),
  contextSub(
    "fortition.w_to_v",
    "w → v / #_V",
    "fortition",
    "w",
    "v",
    (_p, i, w) => i === 0 && i + 1 < w.length && isVowel(w[i + 1]!),
    0.05,
    "Word-initial w hardens to v, reintroducing fricatives.",
  ),
  contextSub(
    "fortition.j_to_dz",
    "j → dʒ / #_V",
    "fortition",
    "j",
    "dʒ",
    (_p, i, w) => i === 0 && i + 1 < w.length && isVowel(w[i + 1]!),
    0.04,
    "Word-initial j hardens to dʒ.",
  ),
  contextSub(
    "lenition.z_to_r",
    "z → r / V_V (rhotacism)",
    "lenition",
    "z",
    "r",
    (_p, i, w) => i > 0 && i < w.length - 1 && isVowel(w[i - 1]!) && isVowel(w[i + 1]!),
    0.08,
    "Rhotacism: intervocalic z → r (classical Latin pattern).",
  ),
  mappingSub(
    "palatalization.cascade",
    "tʃ → ʃ, kʲ → tʃ",
    "palatalization",
    [
      ["tʃ", "ʃ"],
      ["kʲ", "tʃ"],
    ],
    0.05,
    "Palatal cascade: earlier palatalization outputs lenite, new palatalizations fill in.",
  ),

  // --- Tonogenesis / detonogenesis ---

  {
    id: "tonogenesis.voiced_coda",
    label: "V → V˩ / _[+voiced]#",
    category: "vowel",
    description:
      "Tonogenesis: a word-final voiced obstruent lowers the preceding vowel (tone split). Disabled by default — branches can pick it up via rule-set perturbation on split.",
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const last = w[w.length - 1]!;
      const prev = w[w.length - 2]!;
      if (toneOf(prev)) return 0;
      if (!isVowel(stripTone(prev))) return 0;
      if (VOICED.has(last)) return 0.04;
      if (VOICELESS.has(last)) return 0.04;
      return 0;
    },
    apply: (word, rng) => {
      if (word.length < 2) return word;
      const last = word[word.length - 1]!;
      const prev = word[word.length - 2]!;
      if (toneOf(prev)) return word;
      if (!isVowel(stripTone(prev))) return word;
      // Tonogenesis canonical mapping is: voiced → LOW, voiceless → HIGH.
      // Probabilistic: 75% canonical, 20% reversed, 5% mid — gives languages
      // unexpected tonal profiles rather than a deterministic rule.
      const isVoicedCtx = VOICED.has(last);
      const isVoicelessCtx = VOICELESS.has(last);
      if (!isVoicedCtx && !isVoicelessCtx) return word;
      const canonical = isVoicedCtx ? LOW : HIGH;
      const reversed = isVoicedCtx ? HIGH : LOW;
      const roll = rng.next();
      const tone = roll < 0.75 ? canonical : roll < 0.95 ? reversed : "˧";
      const out = word.slice();
      out[out.length - 2] = prev + tone;
      return out;
    },
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "tonogenesis.voiced_coda_loss",
    label: "Cvoiced → ∅ / V˩_#",
    category: "deletion",
    description:
      "After tonogenesis: the now-redundant voiced coda drops, leaving only the tone on the vowel.",
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const last = w[w.length - 1]!;
      const prev = w[w.length - 2]!;
      if (toneOf(prev) && VOICED.has(last)) return 0.08;
      return 0;
    },
    apply: (word) => {
      if (word.length < 2) return word;
      const last = word[word.length - 1]!;
      const prev = word[word.length - 2]!;
      if (toneOf(prev) && VOICED.has(last)) return word.slice(0, -1);
      return word;
    },
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "detonogenesis.tone_loss",
    label: "V˥/V˩ → V (sporadic)",
    category: "vowel",
    description:
      "Detonogenesis (rare): each toned vowel independently rolls to lose its tone. Some words keep tones longer than others.",
    probabilityFor: (w) => {
      for (const p of w) if (toneOf(p)) return 0.04;
      return 0;
    },
    apply: (word, rng) =>
      word.map((p) => (toneOf(p) && rng.chance(0.35) ? stripTone(p) : p)),
    enabledByDefault: false,
    baseWeight: 1,
  },

  // --- Clicks (very rare) ---

  {
    id: "inventory.click_introduction",
    label: "C → click (rare)",
    category: "fortition",
    description:
      "Very rare: a stop consonant is reanalyzed as a click, typically spreading via prestige vocabulary.",
    probabilityFor: (w) => {
      let stops = 0;
      for (const p of w) if (p === "t" || p === "k" || p === "p") stops++;
      return stops > 0 ? 0.002 : 0;
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length; i++) {
        const p = word[i]!;
        if (p === "t" || p === "k" || p === "p") sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = CLICKS[rng.int(CLICKS.length)]!;
      return out;
    },
    enabledByDefault: false,
    baseWeight: 1,
  },
  mappingSub(
    "inventory.click_loss",
    "click → stop",
    "lenition",
    [
      ["ǀ", "t"],
      ["ǃ", "k"],
      ["ǂ", "tʃ"],
      ["ǁ", "l"],
    ],
    0.03,
    "Clicks eroding into ordinary stops in daughter languages.",
  ),

  // --- Retroflex series ---

  mappingSub(
    "retroflex.series",
    "s → ʂ, t → ʈ, d → ɖ, n → ɳ",
    "fortition",
    [
      ["s", "ʂ"],
      ["t", "ʈ"],
      ["d", "ɖ"],
      ["n", "ɳ"],
    ],
    0.015,
    "Retroflex series emerges. Rare; when on, gradually retroflexes alveolars.",
  ),

  // --- Stress-sensitive reduction (new) ---
  UNSTRESSED_REDUCTION,

  // --- Compensatory lengthening ---
  // When a word-final consonant deletes after a short vowel, the vowel
  // lengthens in compensation. Classic sound change: Latin `noctem` →
  // French `nuit`, Proto-Germanic `*gansiz` → Old English `gōs`. Modeled
  // as a single opportunistic step — if the last phoneme is a consonant
  // and the one before is a short vowel, delete the coda and mark the
  // vowel long.
  {
    id: "compensatory.final_coda_lengthening",
    label: "VC# → Vː#",
    category: "deletion",
    description:
      "Word-final consonant deletes and lengthens the preceding short vowel.",
    enabledByDefault: true,
    baseWeight: 0.6,
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const last = w[w.length - 1]!;
      const prev = w[w.length - 2]!;
      if (!isConsonant(last)) return 0;
      if (!isVowel(prev)) return 0;
      // Skip already-long vowels — nothing to lengthen.
      if (prev.endsWith("ː")) return 0;
      return 0.05;
    },
    apply: (word) => {
      if (word.length < 2) return word;
      const last = word[word.length - 1]!;
      const prev = word[word.length - 2]!;
      if (!isConsonant(last) || !isVowel(prev) || prev.endsWith("ː")) return word;
      const out = word.slice(0, -1);
      out[out.length - 1] = prev + "ː";
      return out;
    },
  },

  // --- Vowel harmony (front / back) ---
  // Classic harmony: every vowel in a word matches the FIRST vowel's
  // backness. Turkish / Finnish / Hungarian flavour. Disabled by
  // default; a language can turn it on via the controls panel or by
  // per-language change-weights reaching it during split jitter.
  {
    id: "harmony.backness",
    label: "V harmony by backness",
    category: "assimilation",
    description:
      "Every vowel in a word aligns its backness with the first vowel " +
      "(Turkish-style harmony).",
    enabledByDefault: false,
    baseWeight: 0.4,
    probabilityFor: (w) => {
      // Fire when there are ≥ 2 vowels whose backness disagrees with
      // the first vowel — i.e. there's work to do. Scale by count.
      let disagree = 0;
      let firstBack: "front" | "back" | null = null;
      for (const p of w) {
        if (!isVowel(p)) continue;
        const back = vowelBackness(p);
        if (back === null) continue;
        if (firstBack === null) firstBack = back;
        else if (back !== firstBack) disagree++;
      }
      return disagree === 0 ? 0 : Math.min(0.25, 0.05 * disagree);
    },
    apply: (word) => {
      // Find first vowel's backness; rewrite every subsequent vowel.
      let firstBack: "front" | "back" | null = null;
      const out = word.slice();
      for (let i = 0; i < out.length; i++) {
        if (!isVowel(out[i]!)) continue;
        const back = vowelBackness(out[i]!);
        if (back === null) continue;
        if (firstBack === null) {
          firstBack = back;
          continue;
        }
        if (back !== firstBack) {
          const shifted = harmonizeVowel(out[i]!, firstBack);
          if (shifted !== out[i]) out[i] = shifted;
        }
      }
      return out;
    },
  },

  // --- Umlaut / i-mutation ---
  // A back vowel becomes fronted when a /i/ or /j/ appears within two
  // segments to its right. Models Germanic umlaut (foot → feet type):
  // the triggering /i/ may later delete via another rule, leaving
  // only the fronted vowel as surface evidence of the original plural
  // suffix. On by default — cheap to gate, produces strikingly
  // realistic morphophonological alternations.
  {
    id: "umlaut.front_before_front_vowel",
    label: "V → V̈ / _…[i,j]",
    category: "assimilation",
    description:
      "Back vowels front when followed by /i/ or /j/ within two " +
      "segments — classic umlaut / i-mutation.",
    enabledByDefault: true,
    baseWeight: 0.6,
    probabilityFor: (w) => {
      let sites = 0;
      for (let i = 0; i < w.length - 1; i++) {
        if (!isBackVowel(w[i]!)) continue;
        const a = w[i + 1];
        const b = w[i + 2];
        if (a === "i" || a === "j" || b === "i" || b === "j") sites++;
      }
      return sites === 0 ? 0 : Math.min(0.3, 0.07 * sites);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 1; i++) {
        if (!isBackVowel(word[i]!)) continue;
        const a = word[i + 1];
        const b = word[i + 2];
        if (a === "i" || a === "j" || b === "i" || b === "j") sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const fronted = frontCounterpart(word[idx]!);
      if (!fronted || fronted === word[idx]) return word;
      const out = word.slice();
      out[idx] = fronted;
      return out;
    },
  },

  // --- Preglottalisation of word-final voiceless stops ---
  // Final /p t k/ pick up a glottal onset (/ʔp ʔt ʔk/). Attested
  // trajectory in Cockney English, colloquial Vietnamese, many Austro-
  // Asiatic languages. Often the intermediate step toward full glottal
  // replacement (t → ʔ in Estuary English). Left off by default so only
  // languages that organically drift into it pick it up.
  {
    id: "glottalization.preglottal_final_stop",
    label: "p/t/k → ʔp/ʔt/ʔk / _#",
    category: "fortition",
    description:
      "Word-final voiceless stops gain a glottal onset (preglottalisation).",
    enabledByDefault: false,
    baseWeight: 0.5,
    probabilityFor: (w) => {
      const last = w[w.length - 1];
      return last === "p" || last === "t" || last === "k" ? 0.08 : 0;
    },
    apply: (word) => {
      const last = word[word.length - 1];
      const map: Record<string, string> = { p: "ʔp", t: "ʔt", k: "ʔk" };
      if (!last || !(last in map)) return word;
      const out = word.slice();
      out[out.length - 1] = map[last]!;
      return out;
    },
  },

  // --- Ejectivisation of initial voiceless stops ---
  // Word-initial /p t k/ acquire a glottalic-egressive release,
  // surfacing as /pʼ tʼ kʼ/. The emergence pathway is typologically
  // well-attested in NW Caucasian, Salishan, Ethio-Semitic, and
  // Quechuan. Often triggered by areal contact — the areal-diffusion
  // machinery will carry it across sister languages when it fires.
  {
    id: "glottalization.initial_ejective",
    label: "p/t/k → pʼ/tʼ/kʼ / #_",
    category: "fortition",
    description:
      "Word-initial voiceless stops become ejectives (glottalic egressive).",
    enabledByDefault: false,
    baseWeight: 0.4,
    probabilityFor: (w) => {
      const first = w[0];
      return first === "p" || first === "t" || first === "k" ? 0.06 : 0;
    },
    apply: (word) => {
      const first = word[0];
      const map: Record<string, string> = { p: "pʼ", t: "tʼ", k: "kʼ" };
      if (!first || !(first in map)) return word;
      const out = word.slice();
      out[0] = map[first]!;
      return out;
    },
  },

  // --- Debuccalisation of ejectives and preglottals to bare glottal ---
  // The tail of the glottalic cycle: preglottalised and ejective stops
  // collapse to plain /ʔ/ (Estuary English "bu'er" for "butter",
  // widespread in Polynesian and Melanesian histories). Left off by
  // default; languages pick it up only if they've already undergone
  // preglottalisation or ejectivisation and want to simplify.
  {
    id: "glottalization.debuccalise_to_glottal",
    label: "ʔp/ʔt/ʔk/pʼ/tʼ/kʼ → ʔ",
    category: "lenition",
    description:
      "Glottalised stops debuccalise to bare /ʔ/ (loss of oral closure).",
    enabledByDefault: false,
    baseWeight: 0.3,
    probabilityFor: (w) => {
      let n = 0;
      for (const p of w) {
        if (
          p === "ʔp" || p === "ʔt" || p === "ʔk" ||
          p === "pʼ" || p === "tʼ" || p === "kʼ"
        ) n++;
      }
      return n === 0 ? 0 : Math.min(0.25, 0.1 * n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length; i++) {
        const p = word[i]!;
        if (
          p === "ʔp" || p === "ʔt" || p === "ʔk" ||
          p === "pʼ" || p === "tʼ" || p === "kʼ"
        ) sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = "ʔ";
      return out;
    },
  },
];

/**
 * Return the IPA backness of a vowel, or `null` for segments we can't
 * classify. Used by the harmony rule to check "does this disagree
 * with the word's first vowel?".
 */
function vowelBackness(p: Phoneme): "front" | "back" | null {
  // Strip tone + length suffixes for the lookup.
  let base = p;
  while (
    base.length > 1 &&
    /[ːˈˌ˥˧˩]/.test(base.charAt(base.length - 1))
  ) {
    base = base.slice(0, -1);
  }
  const front = new Set([
    "i", "y", "e", "ɛ", "æ", "ø", "œ", "ɪ",
    "á", "é", "í", "à", "è", "ì", "â", "ê", "î", "ā", "ē", "ī", "ã", "ẽ", "ĩ",
  ]);
  const back = new Set([
    "u", "o", "ɔ", "ɒ", "ɑ", "a", "ɯ", "ʊ",
    "ú", "ó", "ù", "ò", "û", "ô", "ū", "ō", "ũ", "õ",
  ]);
  if (front.has(base)) return "front";
  if (back.has(base)) return "back";
  // /ə/ and /ɨ/ are central — treat as neutral by returning null so
  // the harmony rule doesn't flip them either way.
  return null;
}

function isBackVowel(p: Phoneme): boolean {
  return vowelBackness(p) === "back";
}

/**
 * For harmony: turn a vowel into its counterpart of the requested
 * backness, preserving height and rounding where possible.
 */
function harmonizeVowel(p: Phoneme, want: "front" | "back"): Phoneme {
  const map: Record<string, { front: string; back: string }> = {
    i: { front: "i", back: "ɯ" },
    e: { front: "e", back: "o" },
    ɛ: { front: "ɛ", back: "ɔ" },
    a: { front: "æ", back: "a" },
    æ: { front: "æ", back: "a" },
    o: { front: "e", back: "o" },
    ɔ: { front: "ɛ", back: "ɔ" },
    u: { front: "y", back: "u" },
    y: { front: "y", back: "u" },
    ø: { front: "ø", back: "o" },
    ɯ: { front: "i", back: "ɯ" },
  };
  // Preserve trailing length / tone suffix.
  let base = p;
  let suffix = "";
  while (
    base.length > 1 &&
    /[ːˈˌ˥˧˩]/.test(base.charAt(base.length - 1))
  ) {
    suffix = base.charAt(base.length - 1) + suffix;
    base = base.slice(0, -1);
  }
  const swap = map[base];
  if (!swap) return p;
  return swap[want] + suffix;
}

/**
 * For umlaut: pick the front counterpart of a back vowel.
 */
function frontCounterpart(p: Phoneme): Phoneme | null {
  const map: Record<string, string> = {
    a: "æ",
    o: "ø",
    u: "y",
    ɔ: "œ",
    ɑ: "æ",
    ɯ: "i",
    ʊ: "ʏ",
  };
  let base = p;
  let suffix = "";
  while (
    base.length > 1 &&
    /[ːˈˌ˥˧˩]/.test(base.charAt(base.length - 1))
  ) {
    suffix = base.charAt(base.length - 1) + suffix;
    base = base.slice(0, -1);
  }
  const fronted = map[base];
  if (!fronted) return null;
  return fronted + suffix;
}

export const CATALOG_BY_ID: Record<string, SoundChange> = Object.fromEntries(
  CATALOG.map((c) => [c.id, c]),
);
