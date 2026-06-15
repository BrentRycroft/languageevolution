import { describe, it, expect } from "vitest";
import {
  getVectorBackend, cpuVectorBackend, type VectorBackend,
  geometricMemo, clearGeometricMemo, geometricMemoSize, pointKey,
} from "../semantics/vectorBackend";
import { fromFloats, distanceSq, type Vec } from "../semantics/vec";
import { nearestAnchor } from "../semantics/anchors";
import { embed } from "../semantics/embeddings";

/**
 * G7 T1 — the pluggable vector backend. The default is the deterministic CPU
 * backend (the only one CI exercises in Node); a WebGPU backend plugs in here in
 * T3 and must reproduce these integer results exactly.
 */
describe("G7 — CPU vector backend", () => {
  const b: VectorBackend = getVectorBackend();
  const rows: Vec[] = [fromFloats([0, 0]), fromFloats([1, 0]), fromFloats([0, 1])];
  const labels = ["a", "b", "c"];

  it("getVectorBackend defaults to the deterministic CPU backend", () => {
    expect(b.name).toBe("cpu");
    expect(b).toBe(cpuVectorBackend());
  });

  it("nearestIndex returns the argmin by squared distance", () => {
    expect(b.nearestIndex(rows, labels, fromFloats([0.9, 0.1]), distanceSq)).toBe(1); // → "b"
    expect(b.nearestIndex(rows, labels, fromFloats([0.1, 0.9]), distanceSq)).toBe(2); // → "c"
  });

  it("topKIndices returns the k nearest, nearest-first", () => {
    // query at "b": b exact (0), then a and c tie at distance 1 → label tie-break a<c.
    expect(b.topKIndices(rows, labels, fromFloats([1, 0]), 2, distanceSq)).toEqual([1, 0]);
  });

  it("breaks exact ties by label ascending (deterministic)", () => {
    // [0.5,0.5] is equidistant from all three rows → ranking is purely the tie-break.
    expect(b.topKIndices(rows, labels, fromFloats([0.5, 0.5]), 3, distanceSq)).toEqual([0, 1, 2]);
  });
});

describe("G7 T2 — per-generation geometric memo", () => {
  it("memoises by key and does not re-run compute on a hit", () => {
    clearGeometricMemo();
    let calls = 0;
    const a = geometricMemo("k", () => { calls++; return 42; });
    const b = geometricMemo("k", () => { calls++; return 99; });
    expect(a).toBe(42);
    expect(b).toBe(42); // hit → second compute never runs
    expect(calls).toBe(1);
  });

  it("clearGeometricMemo resets the cache", () => {
    clearGeometricMemo();
    geometricMemo("x", () => 1);
    expect(geometricMemoSize()).toBeGreaterThan(0);
    clearGeometricMemo();
    expect(geometricMemoSize()).toBe(0);
  });

  it("nearestAnchor is byte-identical cold vs warm (memo never changes the result)", () => {
    clearGeometricMemo();
    const p = fromFloats(embed("water"));
    const cold = nearestAnchor(p).concept; // miss
    const warm = nearestAnchor(p).concept; // hit
    expect(warm).toBe(cold);
  });

  it("pointKey is content-based (same content ⇒ same key)", () => {
    expect(pointKey(fromFloats([1, 2, 3]))).toBe(pointKey(fromFloats([1, 2, 3])));
    expect(pointKey(fromFloats([1, 2, 3]))).not.toBe(pointKey(fromFloats([1, 2, 4])));
  });
});
