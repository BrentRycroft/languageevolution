import { describe, it, expect } from "vitest";
import { weightedSample } from "../utils/sampling";
import { makeRng } from "../rng";

describe("weightedSample", () => {
  it("returns null for empty input", () => {
    expect(weightedSample([], () => 1, makeRng("a"))).toBeNull();
  });

  it("returns null when all weights are zero", () => {
    expect(weightedSample(["a", "b", "c"], () => 0, makeRng("b"))).toBeNull();
  });

  it("skews toward high-weight items", () => {
    const counts = { a: 0, b: 0, c: 0 };
    const rng = makeRng("skew");
    for (let i = 0; i < 3000; i++) {
      const pick = weightedSample(
        ["a", "b", "c"] as const,
        (item) => (item === "a" ? 10 : 1),
        rng,
      );
      if (pick) counts[pick]++;
    }
    // "a" should dominate roughly 10:1:1 — expect > 60% of picks.
    expect(counts.a).toBeGreaterThan(1800);
    expect(counts.b).toBeGreaterThan(100);
    expect(counts.c).toBeGreaterThan(100);
  });

  it("deterministic under same seed", () => {
    const r1 = makeRng("same");
    const r2 = makeRng("same");
    const items = ["x", "y", "z"] as const;
    for (let i = 0; i < 100; i++) {
      expect(weightedSample(items, () => 1, r1)).toBe(weightedSample(items, () => 1, r2));
    }
  });
});
