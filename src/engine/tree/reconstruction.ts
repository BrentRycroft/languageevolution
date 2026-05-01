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

function consensusByPosition(forms: WordForm[]): WordForm {
  if (forms.length === 0) return [];
  const centre = pickCentreForm(forms);
  const length = centre.length;
  const out: WordForm = [];
  for (let i = 0; i < length; i++) {
    const tally = new Map<string, number>();
    for (const f of forms) {
      if (i >= f.length) continue;
      const p = f[i]!;
      tally.set(p, (tally.get(p) ?? 0) + 1);
    }
    let bestPhoneme = centre[i]!;
    let bestCount = tally.get(bestPhoneme) ?? 0;
    for (const [p, c] of tally) {
      if (c > bestCount) {
        bestCount = c;
        bestPhoneme = p;
      }
    }
    out.push(bestPhoneme);
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
