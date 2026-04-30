import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";

describe("lexicogenesis e2e", () => {
  it("coinages are fully tagged and trackable", () => {
    const sim = createSimulation({
      ...defaultConfig(),
      seed: "lexicogenesis-e2e",
      genesis: { ...defaultConfig().genesis, globalRate: 0.3 },
    });
    for (let i = 0; i < 300; i++) sim.step();
    const state = sim.getState();
    for (const id of leafIds(state.tree)) {
      const lang = state.tree[id]!.language;
      for (const m of Object.keys(lang.lexicon)) {
        expect(lang.lexicon[m]!.length, `empty form for ${m}`).toBeGreaterThan(0);
      }
      const coined = Object.keys(lang.wordOrigin);
      for (const m of coined) {
        if (!lang.lexicon[m]) continue;
        expect(lang.wordOrigin[m]!.length).toBeGreaterThan(0);
        expect(
          typeof lang.wordFrequencyHints[m] === "number",
          `freq for coined ${m}`,
        ).toBe(true);
      }
    }
  });

  it("events log emits at least one non-default origin tag", () => {
    const sim = createSimulation({
      ...defaultConfig(),
      seed: "lexicogenesis-origins",
      genesis: { ...defaultConfig().genesis, globalRate: 0.4 },
      tree: { ...defaultConfig().tree, splitProbabilityPerGeneration: 0.15 },
    });
    for (let i = 0; i < 200; i++) sim.step();
    const state = sim.getState();
    const tags = new Set<string>();
    for (const id of Object.keys(state.tree)) {
      for (const e of state.tree[id]!.language.events) {
        if (e.kind !== "coinage") continue;
        const tag = e.description.split(":")[0]!;
        tags.add(tag);
      }
    }
    expect(tags.size).toBeGreaterThanOrEqual(2);
  });
});
