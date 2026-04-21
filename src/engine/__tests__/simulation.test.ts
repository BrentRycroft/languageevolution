import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import type { Lexicon, LanguageTree } from "../types";

function serializeLeafLexicons(tree: LanguageTree): Record<string, Lexicon> {
  const out: Record<string, Lexicon> = {};
  for (const id of Object.keys(tree).sort()) {
    const node = tree[id]!;
    if (node.childrenIds.length > 0) continue;
    const copy: Lexicon = {};
    for (const m of Object.keys(node.language.lexicon).sort()) {
      copy[m] = node.language.lexicon[m]!.slice();
    }
    out[id] = copy;
  }
  return out;
}

describe("simulation determinism", () => {
  it("two sims with identical config produce identical state after N steps", () => {
    const cfg = defaultConfig();
    const a = createSimulation(cfg);
    const b = createSimulation(cfg);
    for (let i = 0; i < 50; i++) {
      a.step();
      b.step();
    }
    expect(a.getState().generation).toBe(50);
    expect(b.getState().generation).toBe(50);
    expect(Object.keys(a.getState().tree).sort()).toEqual(
      Object.keys(b.getState().tree).sort(),
    );
    expect(serializeLeafLexicons(a.getState().tree)).toEqual(
      serializeLeafLexicons(b.getState().tree),
    );
  });

  it("different seeds diverge", () => {
    const cfg1 = { ...defaultConfig(), seed: "alpha" };
    const cfg2 = { ...defaultConfig(), seed: "omega" };
    const a = createSimulation(cfg1);
    const b = createSimulation(cfg2);
    for (let i = 0; i < 30; i++) {
      a.step();
      b.step();
    }
    const sa = serializeLeafLexicons(a.getState().tree);
    const sb = serializeLeafLexicons(b.getState().tree);
    expect(sa).not.toEqual(sb);
  });

  it("reset returns to initial state", () => {
    const cfg = defaultConfig();
    const sim = createSimulation(cfg);
    const initialGen = sim.getState().generation;
    for (let i = 0; i < 10; i++) sim.step();
    expect(sim.getState().generation).toBeGreaterThan(initialGen);
    sim.reset();
    expect(sim.getState().generation).toBe(0);
  });
});
