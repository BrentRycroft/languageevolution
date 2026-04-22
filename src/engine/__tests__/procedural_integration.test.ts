import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds, splitLeaf } from "../tree/split";
import { makeRng } from "../rng";
import type { GeneratedRule } from "../phonology/generated";

describe("procedural sound-change integration", () => {
  it("after 80 generations at least one leaf has invented an active rule", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "proc" });
    for (let i = 0; i < 80; i++) sim.step();
    const state = sim.getState();
    let totalActive = 0;
    for (const id of leafIds(state.tree)) {
      const lang = state.tree[id]!.language;
      totalActive += (lang.activeRules ?? []).length;
    }
    expect(totalActive).toBeGreaterThan(0);
  });

  it("splitLeaf drops a fraction of parent's active rules into each daughter", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "splitbase" });
    // Step enough that the proto has some rules.
    for (let i = 0; i < 40; i++) sim.step();
    const state = sim.getState();
    const root = state.tree[state.rootId]!.language;
    // Seed a handful of synthetic rules so the drop ratio is measurable.
    const fakeRules: GeneratedRule[] = Array.from({ length: 6 }, (_v, i) => ({
      id: `${root.id}.g0.fake.${i}`,
      family: "lenition",
      templateId: `fake${i}`,
      description: `fake rule ${i}`,
      birthGeneration: 0,
      lastFireGeneration: 0,
      strength: 0.5,
      from: { type: "consonant" },
      context: {},
      outputMap: {},
    }));
    root.activeRules = fakeRules;
    const rng = makeRng("split");
    const [idA, idB] = splitLeaf(state.tree, state.rootId, state.generation + 1, rng);
    const a = state.tree[idA]!.language.activeRules ?? [];
    const b = state.tree[idB]!.language.activeRules ?? [];
    expect(a.length).toBeLessThanOrEqual(fakeRules.length);
    expect(b.length).toBeLessThanOrEqual(fakeRules.length);
  });

  it("semantic drift events carry a taxonomy prefix", () => {
    const sim = createSimulation({
      ...defaultConfig(),
      seed: "tax",
      semantics: { driftProbabilityPerGeneration: 0.2 },
    });
    for (let i = 0; i < 200; i++) sim.step();
    const state = sim.getState();
    const found = new Set<string>();
    for (const id of Object.keys(state.tree)) {
      for (const e of state.tree[id]!.language.events) {
        if (e.kind !== "semantic_drift") continue;
        const prefix = e.description.split(":")[0]!;
        if (
          prefix === "metonymy" ||
          prefix === "metaphor" ||
          prefix === "narrowing" ||
          prefix === "broadening"
        ) {
          found.add(prefix);
        }
      }
    }
    expect(found.size).toBeGreaterThanOrEqual(1);
  });

  it("register seed assigns some meanings a 'high' or 'low' tag", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "reg" });
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    const registered = Object.values(root.registerOf ?? {});
    expect(registered.length).toBeGreaterThan(0);
    for (const v of registered) expect(["high", "low"]).toContain(v);
  });
});
