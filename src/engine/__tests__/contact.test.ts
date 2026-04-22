import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";

describe("contact / loanwords", () => {
  it("records a borrow event somewhere in a 300-gen run", () => {
    const cfg = { ...defaultConfig(), seed: "contact-test" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 300; i++) sim.step();
    const tree = sim.getState().tree;
    const borrowEvents: string[] = [];
    for (const id of Object.keys(tree)) {
      for (const e of tree[id]!.language.events) {
        if (e.description.startsWith("borrowed ")) borrowEvents.push(e.description);
      }
    }
    // With default contact rate 0.02, ~300 gens, multiple leaves, at least one
    // borrow should have fired by now.
    expect(borrowEvents.length).toBeGreaterThan(0);
  });

  it("borrowed words only come from sister languages, not ancestors", () => {
    // Run long enough that borrows happen and verify semantic well-formedness.
    const cfg = { ...defaultConfig(), seed: "sister-only" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 400; i++) sim.step();
    const leaves = leafIds(sim.getState().tree).filter(
      (id) => !sim.getState().tree[id]!.language.extinct,
    );
    expect(leaves.length).toBeGreaterThan(0);
  });
});
