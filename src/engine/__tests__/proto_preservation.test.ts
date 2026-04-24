import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";

describe("proto preservation", () => {
  it("first step auto-splits the proto so the root is preserved as a non-leaf", () => {
    const sim = createSimulation(defaultConfig());
    const before = sim.getState();
    expect(before.tree[before.rootId]!.childrenIds.length).toBe(0);

    sim.step();

    const after = sim.getState();
    const root = after.tree[after.rootId]!;
    // Bootstrap split is now multi-way (2–8 daughters, 2–4 normal);
    // see `pickFirstSplitChildCount`. We assert the shape invariants
    // — proto became internal, ≥ 2 daughters appeared, daughters are
    // leaves — rather than pinning to exactly 2.
    expect(root.childrenIds.length).toBeGreaterThanOrEqual(2);
    expect(root.childrenIds.length).toBeLessThanOrEqual(8);
    // The proto's lexicon is frozen — it's the seed lexicon verbatim.
    const proto = root.language;
    for (const [m, form] of Object.entries(defaultConfig().seedLexicon)) {
      expect(proto.lexicon[m]?.join("")).toBe(form.join(""));
    }
    // The daughters are the live leaves now.
    const leaves = leafIds(after.tree);
    expect(leaves.length).toBe(root.childrenIds.length);
    expect(leaves).not.toContain(after.rootId);
  });

  it("proto lexicon remains identical after many generations", () => {
    const cfg = defaultConfig();
    const sim = createSimulation(cfg);
    for (let i = 0; i < 50; i++) sim.step();
    const state = sim.getState();
    const proto = state.tree[state.rootId]!.language;
    for (const [m, form] of Object.entries(cfg.seedLexicon)) {
      expect(proto.lexicon[m]?.join("")).toBe(form.join(""));
    }
  });

  it("single-language runs (tree mode off) skip the auto-split", () => {
    const cfg = defaultConfig();
    const sim = createSimulation({
      ...cfg,
      modes: { ...cfg.modes, tree: false },
    });
    sim.step();
    const state = sim.getState();
    const root = state.tree[state.rootId]!;
    expect(root.childrenIds.length).toBe(0);
    // The root itself is still the sole leaf and evolves.
    const leaves = leafIds(state.tree);
    expect(leaves).toEqual([state.rootId]);
  });
});
