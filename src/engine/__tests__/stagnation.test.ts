import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";
import { rateMultiplier } from "../phonology/rate";

describe("stagnation resistance", () => {
  it("across 400 generations, leaves log many phonological events (no flat-lining)", () => {
    const cfg = defaultConfig();
    const sim = createSimulation(cfg);
    for (let i = 0; i < 400; i++) sim.step();
    const tree = sim.getState().tree;
    const leaves = leafIds(tree).filter((id) => !tree[id]!.language.extinct);
    expect(leaves.length).toBeGreaterThan(0);
    const totalSoundChanges = leaves
      .map((id) =>
        tree[id]!.language.events.filter((e) => e.kind === "sound_change").length,
      )
      .reduce((a, b) => a + b, 0);
    expect(totalSoundChanges).toBeGreaterThan(40);
  });

  it("rate multiplier varies across generations", () => {
    const values = new Set<string>();
    for (let g = 0; g < 200; g++) {
      values.add(rateMultiplier(g, "L-0").toFixed(3));
    }
    expect(values.size).toBeGreaterThan(25);
  });
});
