/**
 * morphemeFactor.ts — build the additive-by-construction morpheme space (A1, Plan 2).
 *
 * Given root anchors (seeded from GloVe) and word decompositions, solve every affix's vector
 * as the rounded MEAN RESIDUAL over the words that use it — the least-squares fit for
 * `base + affix = wordAnchor`. Roots keep their anchors. Each word's point is the SUM of its
 * morpheme points, so the composition invariant (compositionError == 0) holds by
 * construction; the residual shows up only as reconstruction error vs the word's own anchor
 * (zero for single-occurrence affixes, nonzero where one affix fits many words).
 *
 * v1 assumption (holds for the authored preset data): each decomposed word has AT MOST ONE
 * affix; other parts are roots with known anchors. Affix stacking throws — Track C lifts it.
 */
import { type Vec, sumVecs, subVecs, roundDivVec } from "./vec";

export interface Decomp {
  word: string;
  wordAnchor: Vec;
  parts: string[];
}

export interface FactorInput {
  roots: Map<string, Vec>;
  affixIds: ReadonlySet<string>;
  decomps: readonly Decomp[];
}

export interface FactorResult {
  morphemes: Map<string, Vec>;
  wordPoints: Map<string, Vec>;
}

export function factorizeMorphemes(input: FactorInput): FactorResult {
  const morphemes = new Map<string, Vec>(input.roots);

  const accum = new Map<string, { sum: Vec; n: number }>();
  for (const d of input.decomps) {
    const affixes = d.parts.filter((p) => input.affixIds.has(p));
    if (affixes.length === 0) continue;
    if (affixes.length > 1) {
      throw new Error(`factorize: "${d.word}" stacks ${affixes.length} affixes (v1 supports at most 1)`);
    }
    const affix = affixes[0]!;
    const rootPts: Vec[] = [];
    for (const p of d.parts) {
      if (p === affix) continue;
      const v = input.roots.get(p);
      if (!v) throw new Error(`factorize: root "${p}" of "${d.word}" has no anchor`);
      rootPts.push(v);
    }
    const residual = subVecs(d.wordAnchor, sumVecs(rootPts));
    const a = accum.get(affix);
    if (a) {
      a.sum = sumVecs([a.sum, residual]);
      a.n += 1;
    } else {
      accum.set(affix, { sum: residual, n: 1 });
    }
  }
  for (const [affix, { sum, n }] of accum) morphemes.set(affix, roundDivVec(sum, n));

  const wordPoints = new Map<string, Vec>();
  for (const d of input.decomps) {
    const pts: Vec[] = [];
    for (const p of d.parts) {
      const v = morphemes.get(p);
      if (!v) throw new Error(`factorize: part "${p}" of "${d.word}" unresolved`);
      pts.push(v);
    }
    wordPoints.set(d.word, sumVecs(pts));
  }
  return { morphemes, wordPoints };
}
