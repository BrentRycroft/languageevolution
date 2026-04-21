import { describe, it, expect } from "vitest";
import { driftGrammar, cloneGrammar } from "../grammar/evolve";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { makeRng } from "../rng";

describe("grammar evolution", () => {
  it("produces some shifts over many calls", () => {
    const g = cloneGrammar(DEFAULT_GRAMMAR);
    const rng = makeRng("grammar-drift");
    let total = 0;
    for (let i = 0; i < 50; i++) total += driftGrammar(g, rng).length;
    expect(total).toBeGreaterThan(0);
  });

  it("word-order shifts are only to adjacent types", () => {
    const g = cloneGrammar(DEFAULT_GRAMMAR);
    const rng = makeRng("adjacent-test");
    const adjacency: Record<string, string[]> = {
      SOV: ["SVO", "OSV"],
      SVO: ["SOV", "VSO"],
      VSO: ["SVO", "VOS"],
      VOS: ["VSO", "OVS"],
      OVS: ["VOS", "OSV"],
      OSV: ["OVS", "SOV"],
    };
    for (let i = 0; i < 200; i++) {
      const before = g.wordOrder;
      const shifts = driftGrammar(g, rng);
      const order = shifts.find((s) => s.feature === "wordOrder");
      if (order) {
        expect(adjacency[before as keyof typeof adjacency]).toContain(order.to as string);
      }
    }
  });
});
