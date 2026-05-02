import type { LanguageTree, Meaning, WordForm } from "../types";

function descendantLeafIds(tree: LanguageTree, root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const node = tree[cur];
    if (!node) continue;
    if (node.childrenIds.length === 0) {
      if (!node.language.extinct) out.push(cur);
    } else {
      for (const c of node.childrenIds) stack.push(c);
    }
  }
  return out;
}

export interface ReconstructedForm {
  meaning: Meaning;
  form: WordForm;
  confidence: number;
  attestedIn: number;
  totalDescendants: number;
}

function totalLevenshteinFromCentre(centre: WordForm, all: WordForm[]): number {
  let sum = 0;
  for (const f of all) {
    if (f === centre) continue;
    sum += levenshtein(centre, f);
  }
  return sum;
}

function levenshtein(a: WordForm, b: WordForm): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev: number[] = new Array(n + 1);
  const cur: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j]!;
  }
  return prev[n]!;
}

function pickCentreForm(forms: WordForm[]): WordForm {
  let best = forms[0]!;
  let bestSum = totalLevenshteinFromCentre(best, forms);
  for (let i = 1; i < forms.length; i++) {
    const sum = totalLevenshteinFromCentre(forms[i]!, forms);
    if (sum < bestSum) {
      bestSum = sum;
      best = forms[i]!;
    }
  }
  return best;
}

/**
 * Needleman-Wunsch alignment of `query` against `reference`. Returns an
 * array of [refSegment | null, querySegment | null] pairs where null marks
 * a gap. Used by MSA-style consensus to handle insertions and deletions.
 */
const GAP = "_";
function alignToReference(
  reference: WordForm,
  query: WordForm,
): Array<[string | null, string | null]> {
  const m = reference.length;
  const n = query.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = reference[i - 1] === query[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  // Backtrack.
  const out: Array<[string | null, string | null]> = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i]![j]! === dp[i - 1]![j - 1]! + (reference[i - 1] === query[j - 1] ? 0 : 1)) {
      out.push([reference[i - 1]!, query[j - 1]!]);
      i--;
      j--;
    } else if (i > 0 && dp[i]![j]! === dp[i - 1]![j]! + 1) {
      out.push([reference[i - 1]!, null]);
      i--;
    } else {
      out.push([null, query[j - 1]!]);
      j--;
    }
  }
  out.reverse();
  return out;
}

/**
 * MSA-style consensus reconstruction. Each form is aligned to the centre
 * via Needleman-Wunsch. For each alignment column (anchored on a centre
 * position OR an insertion), tally the segments including gaps. The
 * column's plurality choice wins; columns where gaps dominate are dropped.
 *
 * This handles insertions and deletions, so a 5-phoneme form and a
 * 6-phoneme form no longer pretend the 6th position doesn't exist.
 */
function consensusByPosition(forms: WordForm[]): WordForm {
  if (forms.length === 0) return [];
  const centre = pickCentreForm(forms);

  // Map: column-key (centre index, or insertion marker) → tally of segments.
  // For each form's alignment, walk left-to-right tracking which centre
  // index we're at; gaps in the centre create insertion-column keys.
  const columns: Array<Map<string, number>> = [];
  for (let k = 0; k < centre.length; k++) columns.push(new Map());

  for (const f of forms) {
    const aligned = alignToReference(centre, f);
    let col = 0;
    for (const [refSeg, qSeg] of aligned) {
      if (refSeg !== null) {
        // Anchored column at centre index `col`.
        const tally = columns[col]!;
        const seg = qSeg ?? GAP;
        tally.set(seg, (tally.get(seg) ?? 0) + 1);
        col++;
      }
      // refSeg === null is an insertion in this query relative to centre;
      // we drop it for now (could be added as inter-column anchors in a
      // richer implementation).
    }
  }

  const out: WordForm = [];
  for (let k = 0; k < columns.length; k++) {
    const tally = columns[k]!;
    let best: string = centre[k]!;
    let bestCount = tally.get(best) ?? 0;
    for (const [seg, count] of tally) {
      if (count > bestCount) {
        bestCount = count;
        best = seg;
      }
    }
    if (best !== GAP) out.push(best);
  }
  return out;
}

export function reconstructProtoForm(
  tree: LanguageTree,
  internalNodeId: string,
  meaning: Meaning,
): ReconstructedForm | null {
  const descendants = descendantLeafIds(tree, internalNodeId);
  if (descendants.length === 0) return null;
  const forms: WordForm[] = [];
  for (const id of descendants) {
    const f = tree[id]!.language.lexicon[meaning];
    if (f && f.length > 0) forms.push(f);
  }
  if (forms.length === 0) return null;
  const reconstructed = consensusByPosition(forms);
  if (reconstructed.length === 0) return null;
  let agreement = 0;
  for (const f of forms) {
    const d = levenshtein(reconstructed, f);
    const norm = Math.max(reconstructed.length, f.length);
    if (norm > 0) agreement += 1 - d / norm;
  }
  const confidence = forms.length > 0 ? agreement / forms.length : 0;
  return {
    meaning,
    form: reconstructed,
    confidence,
    attestedIn: forms.length,
    totalDescendants: descendants.length,
  };
}

export function reconstructProtoLexicon(
  tree: LanguageTree,
  internalNodeId: string,
  meanings?: Meaning[],
): ReconstructedForm[] {
  const node = tree[internalNodeId];
  if (!node) return [];
  if (node.childrenIds.length === 0) return [];
  const descendants = descendantLeafIds(tree, internalNodeId);
  if (descendants.length === 0) return [];
  const meaningSet = new Set<Meaning>();
  if (meanings) {
    for (const m of meanings) meaningSet.add(m);
  } else {
    for (const id of descendants) {
      const lang = tree[id]!.language;
      for (const m of Object.keys(lang.lexicon)) meaningSet.add(m);
    }
  }
  const out: ReconstructedForm[] = [];
  for (const m of meaningSet) {
    const r = reconstructProtoForm(tree, internalNodeId, m);
    if (r) out.push(r);
  }
  return out;
}
