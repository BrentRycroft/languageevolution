import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { isVowel, isConsonant } from "./ipa";
import { stripTone } from "./tone";

/**
 * A compact Optimality-Theory-inspired constraint system. Each constraint
 * assigns a non-negative violation count to a candidate form. The language
 * carries a *ranking* (an ordered list of constraint ids). Given a candidate
 * form, the total score is `Σ rank_weight(constraint) * violations`, where
 * rank_weight decays geometrically so higher-ranked constraints dominate.
 *
 * Languages learn by swapping adjacent constraints in the ranking with a
 * small probability each generation, biased toward reinforcing the pattern
 * the existing lexicon already embodies (demote constraints violated
 * frequently by observed forms).
 */
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
      // Crude syllable-final approximation: a consonant immediately after
      // a vowel and not followed by a vowel counts as a coda.
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

/**
 * Geometric rank weight: the i-th ranked constraint contributes
 * `decay ** i`. At decay=0.5 the top constraint is 2× the second, 4× the
 * third, etc. Classic OT is strict dominance (decay=0); this is a soft
 * stochastic variant.
 */
function rankWeight(i: number, decay = 0.5): number {
  return Math.pow(decay, i);
}

/**
 * Score a form against a language's OT ranking. Lower score = better.
 */
export function otScore(form: WordForm, ranking: readonly string[]): number {
  let score = 0;
  for (let i = 0; i < ranking.length; i++) {
    const c = OT_CONSTRAINTS_BY_ID[ranking[i]!];
    if (!c) continue;
    score += rankWeight(i) * c.violations(form);
  }
  return score;
}

/**
 * Phonotactic fit based on OT: scores the form and maps it to [0, 1].
 * Drop-in replacement for the older heuristic.
 */
export function otFit(form: WordForm, lang: Language): number {
  const ranking = lang.otRanking?.length ? lang.otRanking : DEFAULT_OT_RANKING;
  const s = otScore(form, ranking);
  // Map score to 0..1 with a soft exponential; score 0 → 1.0; score 3 → ~0.2.
  return Math.exp(-s / 1.2);
}

/**
 * Learn: with small probability, swap two adjacent constraints whose
 * relative rank conflicts with the current lexicon. This models gradual
 * drift of the language's phonotactic profile. Returns a description of
 * the swap or null.
 */
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
  // Count violations per constraint across the live lexicon.
  const violations = new Map<string, number>();
  for (const cid of ranking) {
    const c = OT_CONSTRAINTS_BY_ID[cid];
    if (!c) continue;
    let v = 0;
    for (const m of meanings) v += c.violations(lang.lexicon[m]!);
    violations.set(cid, v);
  }
  // Look for an adjacent pair where the higher-ranked constraint is being
  // violated MORE than the lower-ranked one — that's evidence the ranking
  // should swap (high-ranked constraint is demoted).
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
