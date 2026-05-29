import { describe, it, expect } from "vitest";
import { findCognates, traceEtymology } from "../translator/cognates";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";

/**
 * cognates.test.ts
 *
 * Test suite for: "cognates + etymology".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

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
    // Phase 70.1: the proto is renamed from "Proto" to a procedurally
    // generated name on its first tick, so assert the chain starts at
    // the ROOT node by id rather than by the literal name "Proto".
    expect(steps[0]!.languageId).toBe(state.rootId);
    expect(steps[steps.length - 1]!.languageId).toBe(leaf);
  });
});
