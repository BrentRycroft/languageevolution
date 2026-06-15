import type { Vec } from "./vec";

/**
 * vectorBackend.ts — G7 pluggable vector backend.
 *
 * The hot geometric queries (nearest-anchor, k-nearest-anchors, nearest cluster
 * centroid) are full-matrix argmin / top-k over integer squared distance — exactly
 * the kernel a GPU accelerates by scoring every row of the embedding matrix in
 * parallel. Routing them through a backend lets a WebGPU implementation (G7 T3,
 * active only when `navigator.gpu` exists) batch them on the device, while the CPU
 * backend — the deterministic default and the only one CI exercises in Node —
 * wraps the existing integer loops BYTE-IDENTICALLY (same tie-break, same order).
 *
 * Determinism: every query ranks by an integer `distSq` with a `labels[i]`-ascending
 * tie-break, matching the pre-G7 argmin/top-k loops, so results never depend on the
 * backend. A GPU backend must reproduce the integer result exactly (T3 equivalence
 * test); GPU float math is never used for ranking.
 */
export interface VectorBackend {
  readonly name: string;
  /**
   * Index of the row of `rows` nearest to `query` by `distSq`. Ties broken by
   * `labels[i]` ascending (matches the existing argmin loops).
   */
  nearestIndex(
    rows: readonly Vec[],
    labels: readonly string[],
    query: Vec,
    distSq: (a: Vec, b: Vec) => number,
  ): number;
  /**
   * Indices of the `k` rows nearest to `query` by `distSq`, nearest-first. Ties
   * broken by `labels[i]` ascending (matches the existing top-k sort).
   */
  topKIndices(
    rows: readonly Vec[],
    labels: readonly string[],
    query: Vec,
    k: number,
    distSq: (a: Vec, b: Vec) => number,
  ): number[];
}

const cpuBackend: VectorBackend = {
  name: "cpu",
  nearestIndex(rows, labels, query, distSq) {
    let best = 0;
    let bestD = distSq(rows[0]!, query);
    for (let i = 1; i < rows.length; i++) {
      const d = distSq(rows[i]!, query);
      if (d < bestD || (d === bestD && labels[i]! < labels[best]!)) {
        bestD = d;
        best = i;
      }
    }
    return best;
  },
  topKIndices(rows, labels, query, k, distSq) {
    const scored = rows.map((p, i) => ({ i, d: distSq(p, query) }));
    scored.sort(
      (x, y) =>
        x.d - y.d ||
        (labels[x.i]! < labels[y.i]! ? -1 : labels[x.i]! > labels[y.i]! ? 1 : 0),
    );
    return scored.slice(0, k).map((x) => x.i);
  },
};

let _backend: VectorBackend = cpuBackend;

/** The active vector backend (WebGPU when present — G7 T3 — else the CPU default). */
export function getVectorBackend(): VectorBackend {
  return _backend;
}

/** The deterministic CPU backend (the default, and CI's reference for equivalence). */
export function cpuVectorBackend(): VectorBackend {
  return cpuBackend;
}

/** Install a backend (WebGPU init in T3; restore CPU in tests by passing the default). */
export function setVectorBackend(b: VectorBackend): void {
  _backend = b;
}
