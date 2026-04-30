import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { isVowel, isConsonant } from "./ipa";
import { stripTone } from "./tone";

export interface OtConstraint {
  id: string;
  label: string;
  description: string;
  violations: (form: WordForm) => number;
}

export const OT_CONSTRAINTS: readonly OtConstraint[] = [
  {
    id: "NoCoda",
    label: "*Coda",
    description: "Syllables should not have codas (every non-final consonant counts if followed by another C).",
    violations: (w) => {
      let n = 0;
      for (let i = 1; i < w.length; i++) {
        if (isConsonant(stripTone(w[i]!)) && isVowel(stripTone(w[i - 1]!))) {
          if (i + 1 >= w.length || isConsonant(stripTone(w[i + 1]!))) n++;
        }
      }
      return n;
    },
  },
  {
    id: "NoComplexOnset",
    label: "*CC-Onset",
    description: "No word-initial consonant clusters.",
    violations: (w) =>
      w.length >= 2 && isConsonant(stripTone(w[0]!)) && isConsonant(stripTone(w[1]!)) ? 1 : 0,
  },
  {
    id: "OnsetRequired",
    label: "Onset",
    description: "Every syllable should begin with a consonant.",
    violations: (w) => (w.length > 0 && isVowel(stripTone(w[0]!)) ? 1 : 0),
  },
  {
    id: "NoVoicedCoda",
    label: "*VoicedCoda",
    description: "Word-final voiced obstruents are marked.",
    violations: (w) => {
      if (w.length === 0) return 0;
      const last = stripTone(w[w.length - 1]!);
      return ["b", "d", "g", "v", "z", "ʒ"].includes(last) ? 1 : 0;
    },
  },
  {
    id: "NoHiatus",
    label: "*VV",
    description: "Adjacent vowels are marked.",
    violations: (w) => {
      let n = 0;
      for (let i = 1; i < w.length; i++) {
        if (isVowel(stripTone(w[i]!)) && isVowel(stripTone(w[i - 1]!))) n++;
      }
      return n;
    },
  },
  {
    id: "FaithMax",
    label: "Max-IO",
    description: "Penalises shortening (every phoneme should be retained). Light penalty on very short forms.",
    violations: (w) => Math.max(0, 3 - w.length),
  },
  {
    id: "FaithDep",
    label: "Dep-IO",
    description: "Penalises epenthesis of schwa.",
    violations: (w) => {
      let n = 0;
      for (const p of w) if (stripTone(p) === "ə") n++;
      return n;
    },
  },
  {
    id: "HarmonicVowels",
    label: "*HeteroV",
    description: "Rewards keeping vowels of the same class (front/back) within a word.",
    violations: (w) => {
      const fronts = new Set(["e", "i", "ɛ", "ɨ", "y", "ø", "œ"]);
      const backs = new Set(["o", "u", "ɔ", "ɯ"]);
      let f = 0, b = 0;
      for (const p of w) {
        const s = stripTone(p);
        if (fronts.has(s)) f++;
        else if (backs.has(s)) b++;
      }
      return Math.min(f, b);
    },
  },
];

export const OT_CONSTRAINTS_BY_ID: Record<string, OtConstraint> = Object.fromEntries(
  OT_CONSTRAINTS.map((c) => [c.id, c]),
);

export const DEFAULT_OT_RANKING: readonly string[] = OT_CONSTRAINTS.map((c) => c.id);

function rankWeight(i: number, decay = 0.5): number {
  return Math.pow(decay, i);
}

export function otScore(form: WordForm, ranking: readonly string[]): number {
  let score = 0;
  for (let i = 0; i < ranking.length; i++) {
    const c = OT_CONSTRAINTS_BY_ID[ranking[i]!];
    if (!c) continue;
    score += rankWeight(i) * c.violations(form);
  }
  return score;
}

export function otFit(form: WordForm, lang: Language): number {
  const ranking = lang.otRanking?.length ? lang.otRanking : DEFAULT_OT_RANKING;
  const s = otScore(form, ranking);
  return Math.exp(-s / 1.2);
}

export function maybeLearnOt(
  lang: Language,
  rng: Rng,
  probability: number,
): { from: string; to: string } | null {
  if (!rng.chance(probability)) return null;
  const ranking = (lang.otRanking?.length ? lang.otRanking : DEFAULT_OT_RANKING).slice();
  if (ranking.length < 2) return null;
  const meanings = Object.keys(lang.lexicon);
  if (meanings.length === 0) return null;
  const violations = new Map<string, number>();
  for (const cid of ranking) {
    const c = OT_CONSTRAINTS_BY_ID[cid];
    if (!c) continue;
    let v = 0;
    for (const m of meanings) v += c.violations(lang.lexicon[m]!);
    violations.set(cid, v);
  }
  const candidates: number[] = [];
  for (let i = 0; i < ranking.length - 1; i++) {
    const hiV = violations.get(ranking[i]!) ?? 0;
    const loV = violations.get(ranking[i + 1]!) ?? 0;
    if (hiV > loV) candidates.push(i);
  }
  if (candidates.length === 0) return null;
  const idx = candidates[rng.int(candidates.length)]!;
  const swapFrom = ranking[idx]!;
  const swapTo = ranking[idx + 1]!;
  [ranking[idx], ranking[idx + 1]] = [ranking[idx + 1]!, ranking[idx]!];
  lang.otRanking = ranking;
  return { from: swapFrom, to: swapTo };
}
