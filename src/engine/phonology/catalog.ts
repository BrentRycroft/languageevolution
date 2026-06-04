import type { SoundChange, WordForm, Phoneme } from "../types";
import { isVowel, isConsonant, isSyllabic } from "./ipa";
import { HIGH, LOW, stripTone, toneOf, capToneStacking, hasLength } from "./tone";
import { UNSTRESSED_REDUCTION, stressedPositions } from "./stress";
import {
  ALL_VOICELESS_CONSONANTS,
  VOICED_OBSTRUENTS,
  STOPS,
  isVelarStop,
  isFrontVowel,
  placeOf,
  mirrorDiacritics,
} from "./inventory";

/**
 * catalog.ts
 *
 * Phonological feature geometry, sound-change rules, syllable shape, stress, tone, sandhi, and inventory homeostasis. Key exports: CATALOG, CATALOG_BY_ID.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const CLICKS = ["ǀ", "ǃ", "ǂ", "ǁ"] as const;
const VOICELESS = ALL_VOICELESS_CONSONANTS;

// Lane A (phonology-expand): lookup tables for the new context-sensitive
// rules added at the end of CATALOG.
//
// Regressive voicing assimilation: a voiceless obstruent → its voiced
// counterpart before a voiced obstruent.
const REGRESSIVE_VOICE: Record<string, Phoneme> = {
  p: "b", t: "d", k: "g", s: "z", f: "v", ʃ: "ʒ", tʃ: "dʒ", θ: "ð", x: "ɣ",
};
// Yod-coalescence: coronal + /j/ fuse into the matching palatal.
const YOD_COALESCE: Record<string, Phoneme> = {
  t: "tʃ", d: "dʒ", s: "ʃ", z: "ʒ", n: "ɲ", l: "ʎ",
};
// Intervocalic spirantisation of voiced stops (Western Romance lenition).
const INTERVOC_SPIRANT: Record<string, Phoneme> = {
  b: "β", d: "ð", g: "ɣ",
};

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
    // Phase 74 (perf): `from` must be present for this rule to fire.
    triggers: [from],
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
    // Phase 74 (perf): `from` is a necessary (not sufficient) condition;
    // absent `from` ⇒ pred never matches ⇒ probability 0.
    triggers: [from],
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
    // Phase 74 (perf): only the mapping's source phonemes can trigger it.
    triggers: [...m.keys()],
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
    "devoicing",
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
    frequency: "common",
    rationale: "Intervocalic voicing is one of the commonest lenitions cross-linguistically — Spanish, Italian, all Celtic.",
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
    frequency: "common",
    rationale: "Final-vowel apocope — Old English vowel loss, French final-e silencing, Romanian short-vowel apocope.",
    label: "V → ∅ / _#  [unstressed]",
    category: "deletion",
    stressFilter: "unstressed",
    description: "Drop unstressed word-final vowel (if a nucleus still remains). Latin → French (rosa → rose), Old English → Middle English -e loss.",
    probabilityFor: (w) => {
      if (w.length < 3) return 0;
      if (!isVowel(w[w.length - 1]!)) return 0;
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
    description: "n assimilates in place before a labial stop (→m) or velar stop (→ŋ).",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 1; i++) {
        if (w[i] === "n") {
          const nx = w[i + 1]!;
          const place = placeOf(nx);
          if (STOPS.has(nx) && (place === "labial" || place === "labiodental" || place === "velar")) n++;
        }
      }
      return 1 - Math.pow(1 - 0.1, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 1; i++) {
        if (word[i] === "n") {
          const nx = word[i + 1]!;
          const place = placeOf(nx);
          if (STOPS.has(nx) && (place === "labial" || place === "labiodental" || place === "velar")) sites.push(i);
        }
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const nx = word[idx + 1]!;
      const place = placeOf(nx);
      const out = word.slice();
      out[idx] = place === "labial" || place === "labiodental" ? "m" : "ŋ";
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "deletion.h_initial",
    label: "h → ∅ / #_",
    category: "deletion",
    description:
      "Drop word-initial h. Evolution-realism Phase 1b: enabled by default and no longer unstressed-only, so /h/ has an EXIT instead of being an absorbing onset sink. Word-initial h-loss is cross-linguistically common in stressed onsets too — English h-dropping, French h muet, Greek psilosis, Spanish Latin-f→h→∅, Māori. The low base rate keeps it a gradual drain (h-deletion is levenshtein-distance-1, so it does not break Swadesh cognate retention).",
    probabilityFor: (w) => (w.length > 1 && w[0] === "h" ? 0.05 : 0),
    apply: (word) => (word[0] === "h" && word.length > 1 ? word.slice(1) : word),
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "palatalization.k_before_front_V",
    frequency: "common",
    rationale: "Velar palatalisation before front vowels — pan-Romance, Slavic, Bantu, English /k/→/tʃ/ in 'church'.",
    label: "K → tʃ / _front-V",
    category: "palatalization",
    description: "Velar stop palatalizes before any front vowel.",
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 1; i++) {
        if (isVelarStop(w[i]!) && isFrontVowel(stripTone(w[i + 1]!))) n++;
      }
      return 1 - Math.pow(1 - 0.09, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 1; i++) {
        if (isVelarStop(word[i]!) && isFrontVowel(stripTone(word[i + 1]!))) sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = mirrorDiacritics(word[idx]!, "tʃ");
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "vowel.lengthening_open_syllable",
    label: "V → Vː / _C# [stressed]",
    category: "vowel",
    stressFilter: "stressed",
    description: "Lengthen final stressed vowel before single consonant.",
    probabilityFor: (w) => {
      if (w.length < 3) return 0;
      const last = w[w.length - 1]!;
      const prev = w[w.length - 2]!;
      if (isConsonant(last) && isVowel(prev) && !hasLength(prev)) return 0.04;
      return 0;
    },
    apply: (word) => {
      if (word.length < 3) return word;
      const last = word[word.length - 1]!;
      const prev = word[word.length - 2]!;
      if (!(isConsonant(last) && isVowel(prev) && !hasLength(prev))) return word;
      const lengthened = prev + "ː";
      const out = word.slice();
      out[out.length - 2] = lengthened;
      return out;
    },
    enabledByDefault: true, // Phase 25: enable for vowel-system dynamism
    baseWeight: 0.8,
  },
  {
    id: "metathesis.r_swap",
    frequency: "rare",
    rationale: "Metathesis is typologically marked — only sporadic in most lineages (Romance ask~aks, Slavic Cr-/Cl- alternations).",
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
    enabledByDefault: true, // Phase 25: rare but real (English ask/aks, Catalan jurar/juriar)
    baseWeight: 0.5,
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
    enabledByDefault: true, // Phase 25: real cross-linguistic (Latin → Romance final-e support)
    baseWeight: 0.5,
  },
  {
    id: "insertion.anaptyxis",
    label: "∅ → ə / C_C",
    category: "insertion",
    positionBias: "internal",
    description:
      "Break up heavy internal CC clusters with a schwa. Phase 29 Tranche 5e: stress filter — anaptyxis tracks unstressed environments where epenthesis is salvaging an over-heavy onset.",
    stressFilter: "unstressed",
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
    enabledByDefault: true, // Phase 25: cluster-breaking (Aramaic-style)
    baseWeight: 0.6,
  },
  {
    id: "deletion.apheresis",
    label: "C → ∅ / #_  [unstressed]",
    category: "deletion",
    positionBias: "initial",
    stressFilter: "unstressed",
    description: "Drop a word-initial single consonant in unstressed initial syllables (esquire → squire, espaniol → spaniol).",
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
    frequency: "common",
    rationale: "Final-vowel apocope (French final-e silencing, Romanian short-vowel apocope) is one of the commonest erosions.",
    label: "C → ∅ / _#",
    category: "deletion",
    positionBias: "final",
    stressFilter: "unstressed",
    description: "Drop a word-final consonant in unstressed final syllables (Old English → Middle English -e drop, French final-consonant loss).",
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
    frequency: "common",
    rationale: "Syncope of unstressed medial vowels — Latin → Romance (calidus → caldo), English → reduced unstressed.",
    label: "V → ∅ / C_C [unstressed]",
    category: "deletion",
    positionBias: "internal",
    stressFilter: "unstressed",
    description: "Drop an internal unstressed vowel between two consonants (Latin → Romance, Old English → Middle English).",
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
    frequency: "rare",
    rationale: "Emphatic gemination as a productive process is uncommon outside Italic, Finnish, and Japanese sokuon.",
    label: "C → CC / V_V",
    category: "gemination",
    positionBias: "internal",
    description:
      "Double an intervocalic consonant (emphatic gemination). Phase 29 Tranche 5e: stress filter — emphatic gemination is canonical in stressed syllables (Italian-style stress-tracked geminate).",
    stressFilter: "stressed",
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
    description:
      "Collapse a double consonant to a single. Phase 29 Tranche 5e: unstressed-only — geminates are preserved in stressed environments (Italian-style preservation pattern).",
    stressFilter: "unstressed",
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

  {
    id: "monophthongization.au_to_o",
    frequency: "common",
    rationale: "Diphthong simplification au → o — universal Romance, Old → Middle English, regular monophthongisation.",
    label: "au → o / ai → e",
    category: "monophthongization",
    description:
      "Diphthongs collapse, re-seeding mid vowels lost to raising. Phase 29 Tranche 5e: typologically more common in stressed syllables (Greek diphthongs collapsed under stress).",
    stressFilter: "stressed",
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

  {
    id: "tonogenesis.voiced_coda",
    label: "V → V˩ / _[+voiced]#  ·  V → V˥ / _[-voiced]#",
    category: "tonogenesis",
    description:
      "Tonogenesis split: word-final voiced obstruent lowers the preceding vowel (˩); voiceless obstruent raises it (˥). Both pathways attested cross-linguistically (Vietnamese, Punjabi, Lhasa Tibetan).",
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const last = w[w.length - 1]!;
      const prev = w[w.length - 2]!;
      if (toneOf(prev)) return 0;
      if (!isVowel(stripTone(prev))) return 0;
      if (VOICED_OBSTRUENTS.has(last)) return 0.04;
      if (VOICELESS.has(last)) return 0.04;
      return 0;
    },
    apply: (word, rng) => {
      if (word.length < 2) return word;
      const last = word[word.length - 1]!;
      const prev = word[word.length - 2]!;
      if (toneOf(prev)) return word;
      if (!isVowel(stripTone(prev))) return word;
      const isVoicedCtx = VOICED_OBSTRUENTS.has(last);
      const isVoicelessCtx = VOICELESS.has(last);
      if (!isVoicedCtx && !isVoicelessCtx) return word;
      const canonical = isVoicedCtx ? LOW : HIGH;
      const reversed = isVoicedCtx ? HIGH : LOW;
      const roll = rng.next();
      const tone = roll < 0.75 ? canonical : roll < 0.95 ? reversed : "˧";
      const out = word.slice();
      // Phase 30 Tranche 30a: cap tone stacking. Prev was guarded
      // against `toneOf` above so this is normally additive on a
      // bare vowel; the cap is still cheap insurance.
      out[out.length - 2] = capToneStacking(prev + tone);
      return out;
    },
    enabledByDefault: true, // Phase 25: tonal genesis (Mandarin / Vietnamese pattern)
    baseWeight: 0.6,
  },
  {
    id: "tonogenesis.voiced_coda_loss",
    label: "Cvoiced → ∅ / V˩_#",
    category: "tonogenesis",
    description:
      "After tonogenesis: the now-redundant voiced coda drops, leaving only the tone on the vowel.",
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const last = w[w.length - 1]!;
      const prev = w[w.length - 2]!;
      if (toneOf(prev) && VOICED_OBSTRUENTS.has(last)) return 0.08;
      return 0;
    },
    apply: (word) => {
      if (word.length < 2) return word;
      const last = word[word.length - 1]!;
      const prev = word[word.length - 2]!;
      if (toneOf(prev) && VOICED_OBSTRUENTS.has(last)) return word.slice(0, -1);
      return word;
    },
    enabledByDefault: false,
    baseWeight: 1,
  },
  {
    id: "detonogenesis.tone_loss",
    label: "V˥/V˩ → V (sporadic)",
    category: "detonogenesis",
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

  {
    id: "inventory.click_introduction",
    frequency: "rare",
    rationale: "Click consonants are restricted to a few areal pockets (Khoisan, southern Bantu, Damin) — not a productive global change.",
    label: "C → click (rare)",
    category: "inventory",
    description:
      "Very rare: a stop consonant is reanalyzed as a click, typically spreading via prestige vocabulary.",
    probabilityFor: (w) => {
      let stops = 0;
      for (const p of w) if (STOPS.has(p)) stops++;
      return stops > 0 ? 0.002 : 0;
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length; i++) {
        if (STOPS.has(word[i]!)) sites.push(i);
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

  mappingSub(
    "retroflex.series",
    "s → ʂ, t → ʈ, d → ɖ, n → ɳ",
    "retroflex",
    [
      ["s", "ʂ"],
      ["t", "ʈ"],
      ["d", "ɖ"],
      ["n", "ɳ"],
    ],
    0.015,
    "Retroflex series emerges. Rare; when on, gradually retroflexes alveolars.",
  ),

  UNSTRESSED_REDUCTION,

  {
    id: "stress.pretonic_weakening",
    label: "V → ə / pretonic",
    category: "stress",
    description:
      "Pretonic vowels (immediately before the stressed syllable) weaken toward schwa. Russian akanye and Romance pretonic reductions are the canonical examples.",
    stressFilter: "pretonic",
    enabledByDefault: false,
    baseWeight: 0.7,
    probabilityFor: (w) => {
      const sites = stressedPositions(w, "pretonic");
      return 1 - Math.pow(1 - 0.04, sites.length);
    },
    apply: (w, rng) => {
      const sites = stressedPositions(w, "pretonic");
      if (sites.length === 0) return w;
      const idx = sites[rng.int(sites.length)]!;
      const stripped = stripTone(w[idx]!);
      if (stripped === "ə") return w;
      const tone = w[idx]!.length > stripped.length ? w[idx]!.slice(stripped.length) : "";
      const out = w.slice();
      // Phase 30 Tranche 30a: cap tone stacking on the new schwa.
      out[idx] = capToneStacking("ə" + tone);
      return out;
    },
  },

  {
    id: "stress.stressed_diphthongization",
    label: "V[ + stress, mid] → diph",
    category: "stress",
    description:
      "Stressed short mid vowels diphthongise (e → je, o → wo). Mediterranean Romance development; rare elsewhere but plausible in any language with a strong stress accent.",
    stressFilter: "stressed",
    enabledByDefault: false,
    baseWeight: 0.4,
    probabilityFor: (w) => {
      const sites = stressedPositions(w, "stressed");
      let n = 0;
      for (const i of sites) {
        const v = stripTone(w[i]!);
        if (v === "e" || v === "o") n++;
      }
      return 1 - Math.pow(1 - 0.05, n);
    },
    apply: (w, rng) => {
      const sites = stressedPositions(w, "stressed").filter((i) => {
        const v = stripTone(w[i]!);
        return v === "e" || v === "o";
      });
      if (sites.length === 0) return w;
      const idx = sites[rng.int(sites.length)]!;
      const v = stripTone(w[idx]!);
      const tone = w[idx]!.length > v.length ? w[idx]!.slice(v.length) : "";
      const glide = v === "e" ? "j" : "w";
      const out = w.slice();
      // Phase 30 Tranche 30a: cap tone stacking on the diphthongised vowel.
      out.splice(idx, 1, glide, capToneStacking(v + tone));
      return out;
    },
  },

  {
    id: "stress.open_syllable_lengthening",
    frequency: "ordinary",
    rationale: "Open-syllable lengthening (Old → Middle English; Old High German) is well-attested but not pan-typological.",
    label: "V → Vː / σ̌_open",
    category: "stress",
    description:
      "Stressed short vowels in open syllables lengthen. Middle English `stān` → `stoːn`; Old High German `tag` → `tāg`. Skips already-long vowels and closed-syllable nuclei.",
    stressFilter: "stressed",
    enabledByDefault: true, // Phase 25: real Germanic + Romance pattern
    baseWeight: 0.6,
    probabilityFor: (w) => {
      const sites = stressedPositions(w, "stressed");
      let n = 0;
      for (const i of sites) {
        const v = stripTone(w[i]!);
        if (hasLength(v)) continue;
        const nxt = w[i + 1];
        const aft = w[i + 2];
        if (!nxt) {
          n++;
          continue;
        }
        if (isConsonant(nxt) && aft && isVowel(stripTone(aft))) n++;
      }
      return 1 - Math.pow(1 - 0.03, n);
    },
    apply: (w, rng) => {
      const sites = stressedPositions(w, "stressed").filter((i) => {
        const v = stripTone(w[i]!);
        if (hasLength(v)) return false;
        const nxt = w[i + 1];
        if (!nxt) return true;
        const aft = w[i + 2];
        return isConsonant(nxt) && !!aft && isVowel(stripTone(aft));
      });
      if (sites.length === 0) return w;
      const idx = sites[rng.int(sites.length)]!;
      const v = stripTone(w[idx]!);
      const tone = w[idx]!.length > v.length ? w[idx]!.slice(v.length) : "";
      const out = w.slice();
      // Phase 30 Tranche 30a: cap tone stacking on the lengthened vowel.
      out[idx] = capToneStacking(v + "ː" + tone);
      return out;
    },
  },

  {
    id: "stress.unstressed_final_apocope",
    frequency: "common",
    rationale: "Stress-conditioned final-vowel loss — Old French / Old English / Middle High German all lost final unstressed vowels.",
    label: "V[ - stress]# → ∅",
    category: "stress",
    description:
      "Word-final unstressed vowels delete. The mechanism behind Old → Middle English ending erosion. Skips monosyllables (the language already keeps the stressed nucleus).",
    stressFilter: "unstressed",
    positionBias: "final",
    enabledByDefault: false,
    baseWeight: 0.5,
    probabilityFor: (w) => {
      if (w.length < 3) return 0;
      const last = w[w.length - 1]!;
      if (!isVowel(stripTone(last))) return 0;
      const others = stressedPositions(w, "unstressed");
      if (others.length === 0) return 0;
      if (!others.includes(w.length - 1)) return 0;
      return 0.04;
    },
    apply: (w) => {
      if (w.length < 3) return w;
      const last = w[w.length - 1]!;
      if (!isVowel(stripTone(last))) return w;
      return w.slice(0, -1);
    },
  },

  {
    id: "stress.unstressed_medial_syncope",
    label: "V[ - stress] → ∅ / V_C…",
    category: "stress",
    description:
      "Medial unstressed vowels delete in word-internal position. Drives the Latin-to-Romance simplification of multi-syllable roots. Word-final apocope is handled by a separate rule.",
    stressFilter: "unstressed",
    enabledByDefault: false,
    baseWeight: 0.4,
    probabilityFor: (w) => {
      const sites = stressedPositions(w, "unstressed").filter(
        (i) => i > 0 && i < w.length - 1,
      );
      return 1 - Math.pow(1 - 0.025, sites.length);
    },
    apply: (w, rng) => {
      const sites = stressedPositions(w, "unstressed").filter(
        (i) => i > 0 && i < w.length - 1,
      );
      if (sites.length === 0) return w;
      const idx = sites[rng.int(sites.length)]!;
      const out = w.slice();
      out.splice(idx, 1);
      return out;
    },
  },

  {
    id: "compensatory.final_coda_lengthening",
    label: "VC# → Vː#",
    category: "compensatory",
    description:
      "Word-final consonant deletes and lengthens the preceding short vowel (Phase 24: weight bumped to compete against bare deletion). Phase 29 Tranche 5e: stressed-only — compensatory lengthening rarely fires on unstressed finals.",
    stressFilter: "stressed",
    enabledByDefault: true,
    baseWeight: 1.4,
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const last = w[w.length - 1]!;
      const prev = w[w.length - 2]!;
      if (!isConsonant(last)) return 0;
      if (!isVowel(prev)) return 0;
      if (hasLength(prev)) return 0;
      return 0.05;
    },
    apply: (word) => {
      if (word.length < 2) return word;
      const last = word[word.length - 1]!;
      const prev = word[word.length - 2]!;
      if (!isConsonant(last) || !isVowel(prev) || hasLength(prev)) return word;
      const out = word.slice(0, -1);
      out[out.length - 1] = prev + "ː";
      return out;
    },
  },

  {
    id: "compensatory.medial_coda_lengthening",
    label: "VCC → VːC (medial)",
    category: "compensatory",
    description:
      "Phase 24: a medial coda consonant in V₁CC₂… deletes and the preceding V₁ lengthens. Models Latin factum → Italian fatto-style mora preservation and English night /nixt/ → /naɪt/ where coda /x/ loss maintains length-by-quality. Phase 29 Tranche 5e: stress filter — mora preservation tracks stress.",
    stressFilter: "stressed",
    enabledByDefault: true,
    baseWeight: 1.0,
    probabilityFor: (w) => {
      // Need V at i, C at i+1, C/V at i+2 (medial), with at least one
      // segment after the deleted C so we don't double-fire with the
      // word-final variant above.
      for (let i = 0; i < w.length - 3; i++) {
        const v = w[i]!;
        const c1 = w[i + 1]!;
        if (!isVowel(v)) continue;
        if (hasLength(v)) continue;
        if (!isConsonant(c1)) continue;
        return 0.04;
      }
      return 0;
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 3; i++) {
        const v = word[i]!;
        const c1 = word[i + 1]!;
        if (!isVowel(v)) continue;
        if (hasLength(v)) continue;
        if (!isConsonant(c1)) continue;
        sites.push(i);
      }
      if (sites.length === 0) return word;
      // Phase 29-2a: was Math.random — broke determinism. Now uses the
      // seeded rng passed in. Root cause of the long-failing
      // simulation.test.ts "two sims with identical config produce
      // identical state" assertion.
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = (out[idx] ?? "") + "ː";
      out.splice(idx + 1, 1);
      return out;
    },
  },

  {
    id: "insertion.shape_repair_epenthesis",
    label: "Cː → əCː / sC → əsC (shape repair)",
    category: "insertion",
    description:
      "Phase 24: low-probability vowel epenthesis to repair awkward CC# codas or CC- onsets after over-erosion. Models Spanish spīritus → espíritu and the general cross-linguistic preference for CV syllables.",
    enabledByDefault: true,
    baseWeight: 0.7,
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const c0 = w[0]!;
      const c1 = w[1]!;
      if (isConsonant(c0) && isConsonant(c1)) return 0.04;
      if (w.length >= 2) {
        const last = w[w.length - 1]!;
        const prev = w[w.length - 2]!;
        if (isConsonant(last) && isConsonant(prev)) return 0.04;
      }
      return 0;
    },
    apply: (word) => {
      const out = word.slice();
      // Prefer onset repair when present, else coda.
      if (out.length >= 2 && isConsonant(out[0]!) && isConsonant(out[1]!)) {
        out.unshift("ə");
        return out;
      }
      if (
        out.length >= 2 &&
        isConsonant(out[out.length - 1]!) &&
        isConsonant(out[out.length - 2]!)
      ) {
        out.splice(out.length - 1, 0, "ə");
        return out;
      }
      return out;
    },
  },

  {
    id: "harmony.backness",
    frequency: "common",
    rationale: "Vowel harmony is an Areal feature in Turkic, Uralic, Mongolic, Yoruba — common where it takes hold.",
    label: "V harmony by backness",
    category: "harmony",
    description:
      "Every vowel in a word aligns its backness with the first vowel " +
      "(Turkish-style harmony).",
    enabledByDefault: true, // Phase 25: vowel harmony families (Turkic, Uralic, Tungusic)
    baseWeight: 0.5,
    probabilityFor: (w) => {
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

  {
    id: "umlaut.front_before_front_vowel",
    frequency: "common",
    rationale: "Vowel umlaut (Germanic *muːs > *myːs > Eng. mice) is a common assimilatory process across Indo-European.",
    label: "V → V̈ / _…[i,j]",
    category: "umlaut",
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

  {
    id: "glottalization.preglottal_final_stop",
    label: "p/t/k → ʔp/ʔt/ʔk / _#",
    category: "glottalization",
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

  {
    id: "glottalization.initial_ejective",
    label: "p/t/k → pʼ/tʼ/kʼ / #_",
    category: "glottalization",
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

  {
    id: "glottalization.debuccalise_to_glottal",
    label: "ʔp/ʔt/ʔk/pʼ/tʼ/kʼ → ʔ",
    category: "glottalization",
    description:
      "Glottalised stops debuccalise to bare /ʔ/ (loss of oral closure).",
    enabledByDefault: true, // Phase 25: useful in language families that have ejectives
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

  // Phase 29 Tranche 5a: well-attested cross-linguistic rule
  // families that the audit identified as missing from the catalog.

  {
    id: "devoicing.final_obstruent",
    frequency: "common",
    rationale: "Final-obstruent devoicing — German, Dutch, Russian, Catalan — among the most attested phonotactic shifts.",
    regime: "blanket",
    label: "[+voiced obstr] → [-voiced] / _#",
    category: "devoicing",
    positionBias: "final",
    description:
      "Final-obstruent devoicing (Auslautverhärtung): word-final b/d/g/v/z → p/t/k/f/s. German, Russian, Polish, Catalan, Turkish. Phase 29 Tranche 5e: predominantly fires in unstressed final syllables (German Tag /taːk/ stress on first syllable, final devoiced).",
    stressFilter: "unstressed",
    enabledByDefault: true,
    baseWeight: 1,
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const last = w[w.length - 1]!;
      return VOICED_OBSTRUENTS.has(last) ? 0.07 : 0;
    },
    apply: (word) => {
      const FINAL_DEVOICE: Record<string, string> = {
        b: "p", d: "t", g: "k", v: "f", z: "s",
        ʒ: "ʃ", dʒ: "tʃ", ɣ: "x", β: "f", ð: "θ",
      };
      if (word.length < 2) return word;
      const last = word[word.length - 1]!;
      const repl = FINAL_DEVOICE[last];
      if (!repl) return word;
      const out = word.slice();
      out[out.length - 1] = repl;
      return out;
    },
  },

  {
    id: "nasalization.vowel_before_nasal",
    frequency: "common",
    rationale: "Vowel nasalisation before a nasal coda — French, Portuguese, Polish — a typologically dominant assimilation.",
    label: "V → Ṽ / _N",
    category: "vowel",
    positionBias: "any",
    description:
      "Vowel nasalization: a vowel before a nasal consonant gains a nasalised allophone (French sang, Portuguese mão, many Niger-Congo). Phase 29 Tranche 5e: stressed-only — French/Portuguese show contrastive nasalisation primarily in stressed syllables.",
    stressFilter: "stressed",
    enabledByDefault: true,
    baseWeight: 0.6,
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 1; i++) {
        const v = w[i]!;
        const c = w[i + 1]!;
        if (!isVowel(stripTone(v)) || v.includes("̃")) continue;
        if (c === "n" || c === "m" || c === "ŋ" || c === "ɲ") n++;
      }
      return 1 - Math.pow(1 - 0.05, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 1; i++) {
        const v = word[i]!;
        const c = word[i + 1]!;
        if (!isVowel(stripTone(v)) || v.includes("̃")) continue;
        if (c === "n" || c === "m" || c === "ŋ" || c === "ɲ") sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = word[idx]! + "̃";
      return out;
    },
  },

  {
    id: "lenition.tap_intervocalic",
    frequency: "common",
    rationale: "Intervocalic /t/ → tap [ɾ] in American English, Spanish, Portuguese; one of the most attested lenitions.",
    label: "t/d → ɾ / V_V  [unstressed]",
    category: "lenition",
    positionBias: "internal",
    stressFilter: "unstressed",
    description:
      "Intervocalic flapping/tapping: alveolar stop reduces to a tap between vowels in unstressed environments (American English butter — flap appears specifically in pretonic / unstressed-following position).",
    enabledByDefault: true,
    baseWeight: 1,
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 1; i < w.length - 1; i++) {
        const p = w[i]!;
        if (p !== "t" && p !== "d") continue;
        if (!isVowel(stripTone(w[i - 1]!))) continue;
        if (!isVowel(stripTone(w[i + 1]!))) continue;
        n++;
      }
      return 1 - Math.pow(1 - 0.06, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 1; i < word.length - 1; i++) {
        const p = word[i]!;
        if (p !== "t" && p !== "d") continue;
        if (!isVowel(stripTone(word[i - 1]!))) continue;
        if (!isVowel(stripTone(word[i + 1]!))) continue;
        sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = "ɾ";
      return out;
    },
  },

  {
    id: "fortition.initial_aspiration",
    frequency: "ordinary",
    rationale: "Initial-stop aspiration is well-attested (English, Greek, German) but not pan-typological.",
    regime: "blanket",
    label: "[-voiced stop] → [+aspirated] / #_",
    category: "fortition",
    positionBias: "initial",
    description:
      "Initial voiceless-stop aspiration: word-initial p/t/k → pʰ/tʰ/kʰ. Mandarin, Korean, English (allophonic), Hindi (contrastive).",
    enabledByDefault: false,
    baseWeight: 1,
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const first = w[0]!;
      if (first !== "p" && first !== "t" && first !== "k") return 0;
      return 0.05;
    },
    apply: (word) => {
      if (word.length < 2) return word;
      const first = word[0]!;
      if (first !== "p" && first !== "t" && first !== "k") return word;
      const out = word.slice();
      out[0] = first + "ʰ";
      return out;
    },
  },

  // Phase 29 Tranche 5a: missing rule families flagged by audit.
  {
    id: "metathesis.liquid_swap",
    frequency: "rare",
    rationale: "Liquid metathesis (Slavic Cr-/Cl- alternations) is sporadic; not a productive process in most lineages.",
    label: "VRC ↔ VRC (liquid metathesis)",
    category: "metathesis",
    description:
      "Liquid (l, r) swaps with adjacent vowel — Old English brid → bird, hros → horse. Common in liquid + obstruent neighbourhoods.",
    enabledByDefault: false,
    baseWeight: 0.6,
    probabilityFor: (w) => {
      for (let i = 1; i < w.length - 1; i++) {
        const c = w[i]!;
        if (c !== "l" && c !== "r") continue;
        const prev = w[i - 1]!;
        if (!isVowel(prev)) continue;
        return 0.04;
      }
      return 0;
    },
    apply: (word) => {
      for (let i = 1; i < word.length - 1; i++) {
        const c = word[i]!;
        if (c !== "l" && c !== "r") continue;
        const prev = word[i - 1]!;
        if (!isVowel(prev)) continue;
        const out = word.slice();
        out[i - 1] = c;
        out[i] = prev;
        return out;
      }
      return word;
    },
  },

  {
    id: "lenition.trill_simplification",
    label: "r → ɾ / V_V",
    category: "lenition",
    description:
      "Trill simplifies to a tap or flap intervocalically. Spanish caro/carro split, Brazilian Portuguese -r weakening. Phase 29 Tranche 5e: unstressed-context preferred — stressed trills resist (Spanish 'carro' /r/ vs unstressed 'pero' /ɾ/).",
    stressFilter: "unstressed",
    enabledByDefault: false,
    baseWeight: 0.7,
    probabilityFor: (w) => {
      for (let i = 1; i < w.length - 1; i++) {
        if (w[i] !== "r") continue;
        if (!isVowel(w[i - 1]!) || !isVowel(w[i + 1]!)) continue;
        return 0.05;
      }
      return 0;
    },
    apply: (word) => {
      for (let i = 1; i < word.length - 1; i++) {
        if (word[i] !== "r") continue;
        if (!isVowel(word[i - 1]!) || !isVowel(word[i + 1]!)) continue;
        const out = word.slice();
        out[i] = "ɾ";
        return out;
      }
      return word;
    },
  },

  {
    id: "inventory.sibilant_merger",
    label: "ʃ ↔ s collapse",
    category: "inventory",
    description:
      "Sibilants merge under contact pressure or featural simplification. Greek-style /sj/ → /s/, late Latin /ʃ/ → /s/.",
    enabledByDefault: false,
    baseWeight: 0.5,
    probabilityFor: (w) => {
      let hasSh = false;
      for (const p of w) {
        if (p === "ʃ" || p === "ʒ") { hasSh = true; break; }
      }
      return hasSh ? 0.04 : 0;
    },
    apply: (word) => {
      const out = word.slice();
      let changed = false;
      for (let i = 0; i < out.length; i++) {
        if (out[i] === "ʃ") { out[i] = "s"; changed = true; }
        else if (out[i] === "ʒ") { out[i] = "z"; changed = true; }
      }
      return changed ? out : word;
    },
  },

  {
    id: "lenition.consonant_gradation",
    label: "C → C̆ (Finnish-style weak grade)",
    category: "lenition",
    description:
      "Finnish-style consonant gradation: closed-syllable triggers a weak grade for stem-internal stops (kk → k, pp → p, tt → t). Phase 29 Tranche 5e: stress-conditioned (weak grade typical in unstressed contexts).",
    stressFilter: "unstressed",
    enabledByDefault: false,
    baseWeight: 0.5,
    probabilityFor: (w) => {
      for (let i = 1; i < w.length; i++) {
        const a = w[i - 1]!;
        const b = w[i]!;
        if (a === b && (a === "k" || a === "p" || a === "t")) return 0.05;
      }
      return 0;
    },
    apply: (word) => {
      for (let i = 1; i < word.length; i++) {
        const a = word[i - 1]!;
        const b = word[i]!;
        if (a === b && (a === "k" || a === "p" || a === "t")) {
          const out = word.slice();
          out.splice(i - 1, 1);
          return out;
        }
      }
      return word;
    },
  },

  {
    id: "fortition.pharyngealisation",
    label: "C → Cˤ / a_",
    category: "fortition",
    description:
      "Adjacent low/back vowels trigger pharyngealisation on coronals. Arabic-style emphatic spread (sˤ, dˤ, tˤ, ðˤ).",
    enabledByDefault: false,
    baseWeight: 0.4,
    probabilityFor: (w) => {
      for (let i = 0; i < w.length; i++) {
        const c = w[i]!;
        if (c !== "s" && c !== "d" && c !== "t") continue;
        const prev = i > 0 ? w[i - 1]! : "";
        const next = i + 1 < w.length ? w[i + 1]! : "";
        if (prev === "a" || prev === "ɑ" || next === "a" || next === "ɑ") {
          return 0.03;
        }
      }
      return 0;
    },
    apply: (word) => {
      for (let i = 0; i < word.length; i++) {
        const c = word[i]!;
        if (c !== "s" && c !== "d" && c !== "t") continue;
        const prev = i > 0 ? word[i - 1]! : "";
        const next = i + 1 < word.length ? word[i + 1]! : "";
        if (prev === "a" || prev === "ɑ" || next === "a" || next === "ɑ") {
          const out = word.slice();
          out[i] = c + "ˤ";
          return out;
        }
      }
      return word;
    },
  },
  // Phase 58.6: general delabialisation + deaspiration rules. PIE-
  // descended presets seed labialised + breathy stops (gʷ, kʷ, gʰ,
  // bʰ, dʰ) heavily; without decay paths these accumulate in
  // descendants. These rules make the marked variants gradually
  // simplify toward unmarked counterparts — Latin / Greek / Sanskrit
  // each independently lost most laryngeals + delabialised over
  // millennia.
  mappingSub(
    "delab.gw_to_g",
    "gʷ → g",
    "delabialisation",
    [
      ["gʷ", "g"],
      ["kʷ", "k"],
      ["gʷʰ", "g"],
    ],
    0.06,
    "Delabialisation of labialised dorsals: PIE *gʷ → Latin/Greek g, English k. The marked feature drops first under contact + freq pressure.",
  ),
  mappingSub(
    "deasp.bh_to_b",
    "bʰ/dʰ/gʰ → b/d/g",
    "deaspiration",
    [
      ["bʰ", "b"],
      ["dʰ", "d"],
      ["gʰ", "g"],
      ["gʲʰ", "gʲ"],
    ],
    0.05,
    "Deaspiration of voiced aspirates: PIE breathy *bʰ/*dʰ/*gʰ collapse to plain b/d/g (Italic, Celtic, Germanic via Grimm). Real path of attestation in IE descendants.",
  ),

  // ── Lane A (phonology-expand): glide ↔ vowel syllabicity alternation ──
  //
  // The user's "I never see j→y": no i↔j or u↔w alternation existed
  // anywhere. These are two faces of one pervasive process —
  //   VOCALISATION: a glide in a non-onset (coda / post-vocalic) slot
  //     drops its consonantal status and surfaces as the matching high
  //     vowel  (/aj/ → /ai/, /aw/ → /au/ — Romance, English offglides).
  //   GLIDING (jod): a high vowel in hiatus (immediately before another
  //     vowel) tightens to the matching glide  (Latin fīlia → Spanish
  //     hija /j/, vidua → viuda /w/ — the classic "jod"). Note /j/
  //     romanises to "y", so this IS the surface "j→y" the user wanted.
  //
  // /j/ is a palatal glide, /i,y/ high front vowels; /w,ɥ/ labial(-ised)
  // glides, /u,y/ high back/front-round vowels.
  {
    id: "vocalization.glide_to_vowel_coda",
    frequency: "common",
    rationale: "Coda/post-vocalic glides vocalise to the matching high vowel (Latin → Romance offglides, English /aɪ/ /aʊ/, French /j/→/i/).",
    label: "j/w/ɥ → i/u/y / V_ (non-prevocalic)",
    category: "vocalization",
    description:
      "A glide vocalises to its matching high vowel when it is NOT a prevocalic onset — i.e. after a vowel and not immediately before another vowel (coda / diphthong offglide). /j/→/i/, /w/→/u/, /ɥ/→/y/.",
    triggers: ["j", "w", "ɥ"],
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length; i++) {
        const p = w[i]!;
        if (p !== "j" && p !== "w" && p !== "ɥ") continue;
        const prev = i > 0 ? w[i - 1]! : undefined;
        const next = i + 1 < w.length ? w[i + 1]! : undefined;
        if (!prev || !isVowel(stripTone(prev))) continue; // needs a vocalic nucleus to its left
        if (next && isVowel(stripTone(next))) continue; // prevocalic onset → stays a glide
        n++;
      }
      return 1 - Math.pow(1 - 0.07, n);
    },
    apply: (word, rng) => {
      const GLIDE_TO_VOWEL: Record<string, Phoneme> = { j: "i", w: "u", ɥ: "y" };
      const sites: number[] = [];
      for (let i = 0; i < word.length; i++) {
        const p = word[i]!;
        if (p !== "j" && p !== "w" && p !== "ɥ") continue;
        const prev = i > 0 ? word[i - 1]! : undefined;
        const next = i + 1 < word.length ? word[i + 1]! : undefined;
        if (!prev || !isVowel(stripTone(prev))) continue;
        if (next && isVowel(stripTone(next))) continue;
        sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = GLIDE_TO_VOWEL[word[idx]!]!;
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "gliding.vowel_to_glide_prevocalic",
    frequency: "common",
    rationale: "High vowels in hiatus glide to the matching approximant (the Romance 'jod': Latin fīlia → Spanish hija, vidua → viuda); cross-linguistically pervasive hiatus resolution.",
    label: "i/u/y → j/w/ɥ / _V (hiatus)",
    category: "vocalization",
    description:
      "A high vowel immediately before another vowel (hiatus) tightens to the matching glide — the 'jod'. /i/→/j/, /u/→/w/, /y/→/ɥ/. Since /j/ romanises to \"y\", this surfaces as the i→y the user expected to see.",
    triggers: ["i", "u", "y"],
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 1; i++) {
        const p = stripTone(w[i]!);
        if (p !== "i" && p !== "u" && p !== "y") continue;
        if (hasLength(w[i]!)) continue; // long vowels resist gliding
        if (!isVowel(stripTone(w[i + 1]!))) continue;
        // Needs a syllable nucleus to its left OR be word-initial onset of
        // a fresh syllable — either way the glide forms an onset to the
        // following vowel. Require the left neighbour to be a consonant or
        // word edge so we don't glide the FIRST half of a falling diphthong.
        const left = i > 0 ? w[i - 1]! : undefined;
        if (left && isVowel(stripTone(left))) continue;
        n++;
      }
      return 1 - Math.pow(1 - 0.05, n);
    },
    apply: (word, rng) => {
      const VOWEL_TO_GLIDE: Record<string, Phoneme> = { i: "j", u: "w", y: "ɥ" };
      const sites: number[] = [];
      for (let i = 0; i < word.length - 1; i++) {
        const p = stripTone(word[i]!);
        if (p !== "i" && p !== "u" && p !== "y") continue;
        if (hasLength(word[i]!)) continue;
        if (!isVowel(stripTone(word[i + 1]!))) continue;
        const left = i > 0 ? word[i - 1]! : undefined;
        if (left && isVowel(stripTone(left))) continue;
        sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = VOWEL_TO_GLIDE[stripTone(word[idx]!)]!;
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  },

  // ── Lane A: dissimilation (was entirely unencoded) ──
  {
    id: "dissimilation.liquid",
    frequency: "rare",
    rationale: "Liquid dissimilation r…r → l…r (Latin peregrīnus → Spanish peligro, arbor → árbol) is sporadic but solidly attested across Romance and beyond.",
    label: "r…r → l…r (liquid dissim.)",
    category: "dissimilation",
    description:
      "When two /r/ occur in a word, the first dissimilates to /l/ (Latin peregrīnus → Spanish peligro). Avoids the OCP violation of identical liquids.",
    triggers: ["r"],
    probabilityFor: (w) => {
      let rCount = 0;
      for (const p of w) if (p === "r") rCount++;
      return rCount >= 2 ? 0.05 : 0;
    },
    apply: (word) => {
      let rCount = 0;
      for (const p of word) if (p === "r") rCount++;
      if (rCount < 2) return word;
      const out = word.slice();
      for (let i = 0; i < out.length; i++) {
        if (out[i] === "r") {
          out[i] = "l";
          break; // dissimilate the FIRST of the pair
        }
      }
      return out;
    },
    enabledByDefault: true,
    baseWeight: 0.5,
  },

  // ── Lane A: more assimilation contexts ──
  {
    id: "assimilation.regressive_voicing",
    frequency: "common",
    rationale: "Regressive voicing assimilation in obstruent clusters — Russian, Polish, Sanskrit, French liaison; one of the commonest cluster assimilations.",
    label: "[-voi obstr] → [+voi] / _[+voi obstr]",
    category: "assimilation",
    description:
      "A voiceless obstruent voices when immediately followed by a voiced obstruent (regressive voicing assimilation): p→b, t→d, k→g, s→z, f→v before b/d/g/z/v/ʒ/dʒ.",
    triggers: ["p", "t", "k", "s", "f", "ʃ", "tʃ", "θ", "x"],
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 1; i++) {
        if (REGRESSIVE_VOICE[w[i]!] && VOICED_OBSTRUENTS.has(w[i + 1]!)) n++;
      }
      return 1 - Math.pow(1 - 0.08, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 1; i++) {
        if (REGRESSIVE_VOICE[word[i]!] && VOICED_OBSTRUENTS.has(word[i + 1]!)) sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = REGRESSIVE_VOICE[word[idx]!]!;
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "assimilation.yod_coalescence",
    frequency: "common",
    rationale: "Yod-coalescence /tj/→/tʃ/, /dj/→/dʒ/, /sj/→/ʃ/, /zj/→/ʒ/ (English nature, soldier; Latin → Romance -tj-/-sj-); a pervasive coronal+jod palatalisation.",
    label: "Cj → palatal / t,d,s,z + j",
    category: "palatalization",
    description:
      "Yod-coalescence: a coronal obstruent fuses with a following /j/ into the matching palatal. /tj/→/tʃ/, /dj/→/dʒ/, /sj/→/ʃ/, /zj/→/ʒ/, /nj/→/ɲ/, /lj/→/ʎ/.",
    triggers: ["t", "d", "s", "z", "n", "l"],
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 0; i < w.length - 1; i++) {
        if (YOD_COALESCE[w[i]!] && w[i + 1] === "j") n++;
      }
      return 1 - Math.pow(1 - 0.08, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length - 1; i++) {
        if (YOD_COALESCE[word[i]!] && word[i + 1] === "j") sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = YOD_COALESCE[word[idx]!]!;
      out.splice(idx + 1, 1); // the /j/ is absorbed
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  },

  // ── Lane A: context-sensitive lenition / fortition across vowel envs ──
  {
    id: "lenition.intervocalic_voiced_stop_to_fricative",
    frequency: "common",
    rationale: "Intervocalic spirantisation of voiced stops b/d/g → β/ð/ɣ is the canonical Western Romance lenition (Spanish, Catalan, Sardinian).",
    label: "b/d/g → β/ð/ɣ / V_V",
    category: "lenition",
    positionBias: "internal",
    description:
      "Voiced stops spirantise between vowels: b→β, d→ð, g→ɣ (Spanish lobo [β], nada [ð], lago [ɣ]). The most characteristic Romance intervocalic lenition.",
    triggers: ["b", "d", "g"],
    probabilityFor: (w) => {
      let n = 0;
      for (let i = 1; i < w.length - 1; i++) {
        if (!INTERVOC_SPIRANT[w[i]!]) continue;
        if (isVowel(stripTone(w[i - 1]!)) && isVowel(stripTone(w[i + 1]!))) n++;
      }
      return 1 - Math.pow(1 - 0.07, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 1; i < word.length - 1; i++) {
        if (!INTERVOC_SPIRANT[word[i]!]) continue;
        if (isVowel(stripTone(word[i - 1]!)) && isVowel(stripTone(word[i + 1]!))) sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      out[idx] = INTERVOC_SPIRANT[word[idx]!]!;
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  },
  {
    id: "fortition.glide_to_obstruent_initial",
    frequency: "ordinary",
    rationale: "Word-initial glide hardening (j→dʒ/ʒ, w→v/gʷ) — Romance (Latin iam → Italian già), Germanic; the fortition counterpart to coda vocalisation.",
    label: "j/w → dʒ/v / #_",
    category: "fortition",
    positionBias: "initial",
    description:
      "Word-initial glides fortify to obstruents: /j/→/dʒ/, /w/→/v/ (Latin iuvenis → Italian giovane; Latin w → Romance v). The onset counterpart of coda vocalisation.",
    triggers: ["j", "w"],
    probabilityFor: (w) => {
      if (w.length < 2) return 0;
      const first = w[0]!;
      if (first !== "j" && first !== "w") return 0;
      if (!isVowel(stripTone(w[1]!))) return 0;
      return 0.04;
    },
    apply: (word) => {
      if (word.length < 2) return word;
      const first = word[0]!;
      if ((first !== "j" && first !== "w") || !isVowel(stripTone(word[1]!))) return word;
      const out = word.slice();
      out[0] = first === "j" ? "dʒ" : "v";
      return out;
    },
    enabledByDefault: true,
    baseWeight: 0.7,
  },
];

const FRONT_VOWEL_SET: ReadonlySet<string> = new Set([
  "i", "y", "e", "ɛ", "æ", "ø", "œ", "ɪ",
  "á", "é", "í", "à", "è", "ì", "â", "ê", "î", "ā", "ē", "ī", "ã", "ẽ", "ĩ",
]);
const BACK_VOWEL_SET: ReadonlySet<string> = new Set([
  "u", "o", "ɔ", "ɒ", "ɑ", "a", "ɯ", "ʊ",
  "ú", "ó", "ù", "ò", "û", "ô", "ū", "ō", "ũ", "õ",
]);
const VOWEL_DIACRITIC_RE = /[ːˈˌ˥˧˩]/;

function vowelBackness(p: Phoneme): "front" | "back" | null {
  let base = p;
  while (
    base.length > 1 &&
    VOWEL_DIACRITIC_RE.test(base.charAt(base.length - 1))
  ) {
    base = base.slice(0, -1);
  }
  if (FRONT_VOWEL_SET.has(base)) return "front";
  if (BACK_VOWEL_SET.has(base)) return "back";
  return null;
}

function isBackVowel(p: Phoneme): boolean {
  return vowelBackness(p) === "back";
}

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
