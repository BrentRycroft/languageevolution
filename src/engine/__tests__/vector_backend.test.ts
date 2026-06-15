import { describe, it, expect } from "vitest";
import { getVectorBackend, cpuVectorBackend, type VectorBackend } from "../semantics/vectorBackend";
import { fromFloats, distanceSq, type Vec } from "../semantics/vec";

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
