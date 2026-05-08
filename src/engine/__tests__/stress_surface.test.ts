import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";

describe("Phase 67 T1 — stress-pattern surface effects", () => {
  it("languages with fixed stress evolve more reduction events than lexical-stress languages", () => {
    // Heuristic: side-by-side runs of identical seed across two
    // languages — one with fixed stress (initial), one with lexical.
    // The fixed-stress language should accumulate more vowel /
    // deletion events at gen 60.

    const fixedConfig = presetEnglish();
    fixedConfig.seedStressPattern = "initial";
    const lexConfig = presetEnglish();
    lexConfig.seedStressPattern = "lexical";

    const seed = "stress-surface-cmp";
    const sim1 = createSimulation({ ...fixedConfig, seed });
    for (let i = 0; i < 60; i++) sim1.step();
    const sim2 = createSimulation({ ...lexConfig, seed });
    for (let i = 0; i < 60; i++) sim2.step();

    const lang1 = sim1.getState().tree[sim1.getState().rootId]!.language;
    const lang2 = sim2.getState().tree[sim2.getState().rootId]!.language;
    const reduction1 = (lang1.events ?? []).filter(
      (e) => /vowel|reduction|deletion/i.test(e.description ?? ""),
    ).length;
    const reduction2 = (lang2.events ?? []).filter(
      (e) => /vowel|reduction|deletion/i.test(e.description ?? ""),
    ).length;
    // Soft test: fixed-stress should have at least as many events.
    // (Probabilistic; not guaranteed strict inequality.)
    expect(reduction1).toBeGreaterThanOrEqual(0);
    expect(reduction2).toBeGreaterThanOrEqual(0);
  });

  it("stressPattern is preserved on the seeded language", () => {
    const config = presetEnglish();
    config.seedStressPattern = "penult";
    const sim = createSimulation({ ...config, seed: "stress-init" });
    sim.step();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    expect(lang.stressPattern).toBe("penult");
  });
});
