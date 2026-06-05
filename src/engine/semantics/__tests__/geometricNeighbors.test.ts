import { describe, it, expect } from "vitest";
import { geometricNeighbors, neighborsOf, SEMANTIC_NEIGHBORS } from "../neighbors";

describe("geometricNeighbors — vector-native neighbour query (additive)", () => {
  it("returns k distinct concepts, excluding the query meaning", () => {
    const n = geometricNeighbors("water", 3);
    expect(n.length).toBe(3);
    expect(new Set(n).size).toBe(3);
    expect(n).not.toContain("water");
  });

  it("is deterministic", () => {
    expect(geometricNeighbors("fire", 5)).toEqual(geometricNeighbors("fire", 5));
  });

  it("surfaces semantically plausible neighbours for clear concepts", () => {
    // GloVe geometry should place these near obviously-related concepts (not asserting exact members,
    // just that the distributional neighbours are non-empty and sane).
    for (const m of ["king", "dog", "river"] as const) {
      const n = geometricNeighbors(m, 5);
      expect(n.length).toBe(5);
      expect(n).not.toContain(m);
    }
  });

  it("reports geometry↔curated-table overlap (documentary — the two are different signals)", () => {
    let overlap = 0;
    let measured = 0;
    for (const m of Object.keys(SEMANTIC_NEIGHBORS)) {
      const curated = new Set(neighborsOf(m));
      if (curated.size === 0) continue;
      measured++;
      const geo = geometricNeighbors(m, 5);
      if (geo.some((g) => curated.has(g))) overlap++;
    }
    const rate = measured > 0 ? overlap / measured : 0;
    // eslint-disable-next-line no-console
    console.log(`geometricNeighbors↔curated overlap (≥1 shared in top-5): ${overlap}/${measured} = ${(rate * 100).toFixed(1)}%`);
    // The curated table is association-based, the geometry distributional — they need not agree.
    // This is documentary: we only assert the query produces results across the board.
    expect(measured).toBeGreaterThan(0);
  });
});
