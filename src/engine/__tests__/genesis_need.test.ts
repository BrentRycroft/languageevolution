import { describe, it, expect } from "vitest";
import { lexicalNeed, sampleNeededMeaning } from "../genesis/need";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import { clusterOf } from "../semantics/clusters";

describe("genesis/need", () => {
  it("meanings already in the lexicon have zero need", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    const need = lexicalNeed(lang, state.tree);
    for (const m of Object.keys(lang.lexicon)) {
      expect(need[m] ?? 0, `lexicon slot ${m}`).toBe(0);
    }
  });

  it("sampleNeededMeaning returns null when nothing is needed", () => {
    const rng = makeRng("empty");
    expect(sampleNeededMeaning({}, rng)).toBeNull();
    expect(sampleNeededMeaning({ foo: 0 }, rng)).toBeNull();
  });

  it("sampleNeededMeaning picks weighted targets", () => {
    const rng = makeRng("s");
    // Highly skewed vector — "rare" should almost never appear.
    const need = { common: 100, rare: 0.01 };
    const counts = { common: 0, rare: 0 };
    for (let i = 0; i < 200; i++) {
      const m = sampleNeededMeaning(need, rng);
      if (m === "common") counts.common++;
      else if (m === "rare") counts.rare++;
    }
    expect(counts.common).toBeGreaterThan(counts.rare * 10);
  });

  it("underpopulated clusters generate positive need", () => {
    // Start from default but drop a cluster's worth of meanings.
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    // Wipe all animals from the lexicon.
    for (const key of Object.keys(lang.lexicon)) {
      if (clusterOf(key) === "animals") delete lang.lexicon[key];
    }
    const need = lexicalNeed(lang, state.tree);
    // Every now-empty animal slot should have positive need.
    expect(need["dog"]).toBeGreaterThan(0);
    expect(need["wolf"]).toBeGreaterThan(0);
  });
});
