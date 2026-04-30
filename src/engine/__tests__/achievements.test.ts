import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from "../achievements/catalog";
import { detectNewAchievements } from "../achievements/detect";

describe("achievements", () => {
  it("no achievements unlock at gen 0 on a fresh run", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "fresh" });
    const fresh = detectNewAchievements(new Set(), sim.getState());
    expect(fresh).not.toContain("polyglot");
    expect(fresh).not.toContain("methuselah");
    expect(fresh).not.toContain("museum");
  });

  it("detectNewAchievements skips already-unlocked ids", () => {
    const sim = createSimulation(defaultConfig());
    for (let i = 0; i < 120; i++) sim.step();
    const state = sim.getState();
    const first = detectNewAchievements(new Set(), state);
    if (first.length === 0) return;
    const second = detectNewAchievements(new Set(first), state);
    expect(second).not.toContain(first[0]);
  });

  it("catalog exports match by-id lookup", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThan(5);
    for (const a of ACHIEVEMENTS) {
      expect(ACHIEVEMENTS_BY_ID[a.id]).toBe(a);
    }
  });

  it("a run of 200 generations unlocks at least one achievement", () => {
    const sim = createSimulation({
      ...defaultConfig(),
      seed: "long-run",
      tree: { ...defaultConfig().tree, splitProbabilityPerGeneration: 0.2 },
    });
    for (let i = 0; i < 200; i++) sim.step();
    const fresh = detectNewAchievements(new Set(), sim.getState());
    expect(fresh.length).toBeGreaterThan(0);
  });
});
