import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";

describe("soft-cap death pressure", () => {
  it("aliveLeaves stay near maxLeaves over a long run (does not balloon)", () => {
    const cfg = defaultConfig();
    cfg.seed = "softcap-1";
    cfg.tree.maxLeaves = 8;
    cfg.tree.unlimitedLeaves = false;
    cfg.tree.splitProbabilityPerGeneration = 0.04;
    cfg.tree.deathProbabilityPerGeneration = 0.005;
    const sim = createSimulation(cfg);
    let maxAlive = 0;
    for (let i = 0; i < 300; i++) {
      sim.step();
      const tree = sim.getState().tree;
      const alive = leafIds(tree).filter((id) => !tree[id]!.language.extinct).length;
      if (alive > maxAlive) maxAlive = alive;
    }
    expect(maxAlive, "max alive leaves should not balloon past 2x cap").toBeLessThan(16);
  });

  it("generationsOverCap counter resets when leaf count drops back under cap", () => {
    const cfg = defaultConfig();
    cfg.seed = "softcap-2";
    cfg.tree.maxLeaves = 6;
    cfg.tree.unlimitedLeaves = false;
    const sim = createSimulation(cfg);
    let everIncremented = false;
    let everReset = false;
    for (let i = 0; i < 200; i++) {
      sim.step();
      const c = sim.getState().generationsOverCap ?? 0;
      if (c > 0) everIncremented = true;
      if (everIncremented && c === 0) everReset = true;
      if (everReset) break;
    }
    expect(everIncremented, "should overshoot during the run").toBe(true);
    expect(everReset, "counter should reset when alive drops back under cap").toBe(true);
  });
});
