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
    // Phase 50 T9: this assertion is RNG-trajectory-sensitive — the
    // pre-50 seed "softcap-2" no longer overshoots the cap because
    // Phase 49's productive-affix init shifted RNG consumption.
    // Run across 3 seeds and require the property to hold on at
    // least one (softcap is a probabilistic property, and one
    // confirmed overshoot+reset across 3 trajectories is sufficient
    // evidence the resetter works).
    const SEEDS = ["softcap-3", "softcap-4", "softcap-5"];
    let observedOvershoot = 0;
    let observedReset = 0;
    for (const seed of SEEDS) {
      const cfg = defaultConfig();
      cfg.seed = seed;
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
      if (everIncremented) observedOvershoot++;
      if (everReset) observedReset++;
    }
    expect(observedOvershoot, "at least one seed should overshoot").toBeGreaterThan(0);
    expect(observedReset, "at least one seed should reset").toBeGreaterThan(0);
  });
});
