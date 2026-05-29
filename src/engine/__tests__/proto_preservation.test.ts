import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";

/**
 * proto_preservation.test.ts
 *
 * Test suite for: "proto preservation".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("proto preservation", () => {
  it("the proto does not auto-split on the first tick (Phase 70.1)", () => {
    // Phase 70.1: pre-70.1 the proto was force-split into 2–9 daughters on
    // the first tick. That was unrealistic (early splits don't happen on
    // day one), so the proto now stays a single leaf until a natural split.
    const sim = createSimulation(defaultConfig());
    const before = sim.getState();
    expect(before.tree[before.rootId]!.childrenIds.length).toBe(0);

    sim.step();

    const after = sim.getState();
    const root = after.tree[after.rootId]!;
    expect(root.childrenIds.length).toBe(0);
    expect(leafIds(after.tree)).toEqual([after.rootId]);
  });

  it("once the proto splits, the root lexicon is frozen (non-leaves don't evolve)", () => {
    // The reconstruction-anchor invariant under Phase 70.1: the proto
    // drifts as a leaf until it splits, after which the root becomes a
    // non-leaf and stops evolving entirely (step() only processes leaves).
    const cfg = defaultConfig();
    const sim = createSimulation(cfg);
    for (let i = 0; i < 300; i++) {
      sim.step();
      if (sim.getState().tree[sim.getState().rootId]!.childrenIds.length > 0) break;
    }
    const rootId = sim.getState().rootId;
    const root = sim.getState().tree[rootId]!;
    expect(root.childrenIds.length).toBeGreaterThan(0); // it split
    const frozen = JSON.stringify(root.language.lexicon);
    // Step further: the root is now a non-leaf and must not change.
    for (let i = 0; i < 30; i++) sim.step();
    const after = sim.getState().tree[rootId]!.language;
    expect(JSON.stringify(after.lexicon)).toBe(frozen);
  });

  it("single-language runs (tree mode off) skip the auto-split", () => {
    const cfg = defaultConfig();
    const sim = createSimulation({
      ...cfg,
      modes: { ...cfg.modes, tree: false },
    });
    sim.step();
    const state = sim.getState();
    const root = state.tree[state.rootId]!;
    expect(root.childrenIds.length).toBe(0);
    const leaves = leafIds(state.tree);
    expect(leaves).toEqual([state.rootId]);
  });
});
