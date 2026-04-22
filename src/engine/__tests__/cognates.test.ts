import { describe, it, expect } from "vitest";
import { findCognates, traceEtymology } from "../translator/cognates";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";

describe("cognates + etymology", () => {
  it("findCognates returns an entry for every node, alive or extinct", () => {
    const sim = createSimulation(defaultConfig());
    for (let i = 0; i < 120; i++) sim.step();
    const state = sim.getState();
    const cognates = findCognates(state.tree, "water");
    expect(cognates.length).toBe(Object.keys(state.tree).length);
    for (const c of cognates) {
      expect(typeof c.form).toBe("string");
      expect(typeof c.languageName).toBe("string");
    }
  });

  it("traceEtymology produces a chain from proto to the selected leaf", () => {
    const sim = createSimulation(defaultConfig());
    for (let i = 0; i < 120; i++) sim.step();
    const state = sim.getState();
    const leaf = leafIds(state.tree)[0]!;
    const steps = traceEtymology(state.tree, leaf, "water");
    expect(steps[0]!.languageName).toBe("Proto");
    expect(steps[steps.length - 1]!.languageId).toBe(leaf);
  });
});
