import type { LanguageTree, WordForm } from "../types";

/**
 * Sound-correspondence tracking across a language tree.
 *
 * For each pair of leaf languages, walks every shared meaning, aligns
 * their forms (Needleman-Wunsch over phonemes), and tallies which
 * segments correspond at each aligned column. Output is a per-pair
 * matrix of (segmentA → segmentB → count) used by reconstruction
 * scoring + by the user-facing Cognates view to surface "regular"
 * correspondences vs sporadic ones.
 *
 * Audit ref: A7 "comparative method needs sound-correspondence
 * tracking" — without this, the simulator's reconstruction can't
 * distinguish regular cognates (those whose correspondences match the
 * statistical pattern) from chance resemblance or borrowing.
 */

const GAP = "_";

export interface CorrespondenceMatrix {
  langAId: string;
  langBId: string;
  /** segmentA → segmentB → count */
  pairs: Map<string, Map<string, number>>;
  /** total aligned columns considered */
  totalColumns: number;
}

function alignPhonemes(a: WordForm, b: WordForm): Array<[string, string]> {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  const out: Array<[string, string]> = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      dp[i]![j]! === dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
    ) {
      out.push([a[i - 1]!, b[j - 1]!]);
      i--;
      j--;
    } else if (i > 0 && dp[i]![j]! === dp[i - 1]![j]! + 1) {
      out.push([a[i - 1]!, GAP]);
      i--;
    } else {
      out.push([GAP, b[j - 1]!]);
      j--;
    }
  }
  out.reverse();
  return out;
}

/** Build the correspondence matrix for one ordered pair of leaves. */
export function buildCorrespondenceMatrix(
  tree: LanguageTree,
  langAId: string,
  langBId: string,
): CorrespondenceMatrix {
  const pairs = new Map<string, Map<string, number>>();
  let totalColumns = 0;
  const a = tree[langAId]?.language;
  const b = tree[langBId]?.language;
  if (!a || !b) return { langAId, langBId, pairs, totalColumns };
  for (const meaning of Object.keys(a.lexicon)) {
    const formA = a.lexicon[meaning];
    const formB = b.lexicon[meaning];
    if (!formA || !formB) continue;
    if (formA.length === 0 || formB.length === 0) continue;
    for (const [segA, segB] of alignPhonemes(formA, formB)) {
      let row = pairs.get(segA);
      if (!row) {
        row = new Map();
        pairs.set(segA, row);
      }
      row.set(segB, (row.get(segB) ?? 0) + 1);
      totalColumns++;
    }
  }
  return { langAId, langBId, pairs, totalColumns };
}

/**
 * Score how "regular" a single (segA, segB) correspondence is given the
 * matrix: the proportion of segA columns that map to segB. Higher = more
 * regular = more likely a true cognate signal vs noise.
 */
export function correspondenceRegularity(
  matrix: CorrespondenceMatrix,
  segA: string,
  segB: string,
): number {
  const row = matrix.pairs.get(segA);
  if (!row) return 0;
  const total = Array.from(row.values()).reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  return (row.get(segB) ?? 0) / total;
}

/**
 * For a single meaning, return a list of (segA, segB, regularity) tuples
 * showing how each aligned column of its two forms matches against the
 * pair-wide statistical pattern. Used by the Cognate explorer to flag
 * cognate quality.
 */
export function scoreMeaningCorrespondence(
  matrix: CorrespondenceMatrix,
  formA: WordForm,
  formB: WordForm,
): Array<{ segA: string; segB: string; regularity: number }> {
  const out: Array<{ segA: string; segB: string; regularity: number }> = [];
  for (const [segA, segB] of alignPhonemes(formA, formB)) {
    out.push({ segA, segB, regularity: correspondenceRegularity(matrix, segA, segB) });
  }
  return out;
}
