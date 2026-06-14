import { describe, it, expect } from "vitest";
import { lexicalNeed, sampleNeededMeaning } from "../genesis/need";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import { clusterOf } from "../semantics/clusters";
import { conceptsAtOrBelow } from "../lexicon/concepts";
import { tGlosses as lexKeys, tDelete as lexDelete, tHas as lexHas } from "../lexicon/__tests__/glossSeam";

/**
 * genesis_need.test.ts
 *
 * Test suite for: "genesis/need".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("genesis/need", () => {
  it("meanings already in the lexicon have zero need", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    const need = lexicalNeed(lang, state.tree);
    for (const m of lexKeys(lang)) {
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
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    // Coverage-gap need fires for BASIC (tier-0) concepts. Pick a tier-0 concept
    // the language has, empty its geometric cluster, and it should register need.
    const basicPresent = conceptsAtOrBelow(0).filter(
      (m) => lexHas(lang, m) && clusterOf(m),
    );
    const target = basicPresent[0]!;
    const cl = clusterOf(target)!;
    for (const key of lexKeys(lang)) {
      if (clusterOf(key) === cl) lexDelete(lang, key);
    }
    const need = lexicalNeed(lang, state.tree);
    expect(need[target]).toBeGreaterThan(0);
  });
});
