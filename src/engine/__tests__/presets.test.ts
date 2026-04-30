import { describe, it, expect } from "vitest";
import { PRESETS } from "../presets";
import { createSimulation } from "../simulation";
import { leafIds } from "../tree/split";

describe("presets", () => {
  for (const preset of PRESETS) {
    it(`${preset.id}: builds and runs 50 generations without crashing`, () => {
      const cfg = preset.build();
      const sim = createSimulation(cfg);
      for (let i = 0; i < 50; i++) sim.step();
      const state = sim.getState();
      expect(state.generation).toBe(50);
      const leaves = leafIds(state.tree);
      expect(leaves.length).toBeGreaterThan(0);
      const root = state.tree[state.rootId]!;
      expect(Object.keys(root.language.lexicon).length).toBeGreaterThan(0);
    });
  }

  it("each preset declares a unique preset id", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
