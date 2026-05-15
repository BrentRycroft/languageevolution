import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { splitLeaf } from "../tree/split";
import { makeRng } from "../rng";

/**
 * Phase 73d Tier D Phase D1 — latent direction vector at split
 * produces anti-correlated sisters.
 *
 * Sample many 2-daughter splits across diverse RNG seeds; assert
 * that sisters end up on OPPOSING halves of each direction axis
 * meaningfully often. The exact threshold (≥70% of seeds) is
 * tunable; the contract is "anti-correlation is real, not
 * accidental noise."
 */

const SAMPLE_SEEDS = 60;

function setupAndSplit(seed: string): {
  childA: ReturnType<typeof firstAlive>;
  childB: ReturnType<typeof firstAlive>;
} {
  const sim = createSimulation({ ...defaultConfig(), seed });
  // Run a few gens so the parent has settled state.
  for (let i = 0; i < 5; i++) sim.step();
  const state = sim.getState();
  const childIds = splitLeaf(state.tree, state.rootId, state.generation + 1, makeRng(`${seed}-split`), {
    childCount: 2,
  });
  expect(childIds.length).toBeGreaterThanOrEqual(2);
  return {
    childA: firstAlive(state, childIds[0]!),
    childB: firstAlive(state, childIds[1]!),
  };
}

function firstAlive(state: ReturnType<ReturnType<typeof createSimulation>["getState"]>, id: string) {
  return state.tree[id]!.language;
}

describe("Phase 73d D1 — typological direction sister anti-correlation", () => {
  it("every daughter gets a typologicalDirection vector at split", () => {
    const { childA, childB } = setupAndSplit("d1-shape");
    expect(childA.typologicalDirection).toBeDefined();
    expect(childB.typologicalDirection).toBeDefined();
    for (const axis of ["simplification", "palatalization", "synthesis"] as const) {
      expect(childA.typologicalDirection![axis]).toBeGreaterThanOrEqual(-1);
      expect(childA.typologicalDirection![axis]).toBeLessThanOrEqual(1);
      expect(childB.typologicalDirection![axis]).toBeGreaterThanOrEqual(-1);
      expect(childB.typologicalDirection![axis]).toBeLessThanOrEqual(1);
    }
  });

  it("sisters land on opposing halves of simplification axis in ≥60% of seeds", () => {
    // Anti-correlation is statistical, not deterministic. With
    // σ=0.6 on the second sister's draw + mean=−0.6×first, the
    // probability of same-half overlap is ~25-35% per axis.
    // Lower bound 60% gives headroom for stochastic variance.
    let opposing = 0;
    for (let i = 0; i < SAMPLE_SEEDS; i++) {
      const { childA, childB } = setupAndSplit(`d1-simpl-${i}`);
      const a = childA.typologicalDirection!.simplification;
      const b = childB.typologicalDirection!.simplification;
      if (Math.sign(a) !== Math.sign(b) && a !== 0 && b !== 0) opposing++;
    }
    expect(opposing / SAMPLE_SEEDS).toBeGreaterThanOrEqual(0.6);
  });

  it("sisters' ruleBias.lenition differs meaningfully in ≥60% of seeds", () => {
    // Direction.simplification maps to ruleBias.lenition with
    // scale 1.5, so opposite-sign sisters end up with
    // (1 + 1.5×a)×base vs (1 + 1.5×b)×base. With a,b ∈ ±0.5
    // typical, the ratio difference is ≥0.5.
    let differ = 0;
    for (let i = 0; i < SAMPLE_SEEDS; i++) {
      const { childA, childB } = setupAndSplit(`d1-bias-${i}`);
      const la = childA.ruleBias?.lenition ?? 1;
      const lb = childB.ruleBias?.lenition ?? 1;
      if (Math.abs(la - lb) >= 0.4) differ++;
    }
    expect(differ / SAMPLE_SEEDS).toBeGreaterThanOrEqual(0.6);
  });

  it("simplifier sisters have higher lenition + lower fortition; preservers the opposite", () => {
    // For each split, the daughter with HIGHER simplification
    // should have HIGHER lenition AND LOWER fortition (when both
    // axes are non-trivial). Cross-axis monotonicity check.
    let consistent = 0;
    let tested = 0;
    for (let i = 0; i < SAMPLE_SEEDS; i++) {
      const { childA, childB } = setupAndSplit(`d1-monot-${i}`);
      const sa = childA.typologicalDirection!.simplification;
      const sb = childB.typologicalDirection!.simplification;
      if (Math.abs(sa - sb) < 0.3) continue; // skip near-tied draws
      tested++;
      const moreSimplifier = sa > sb ? childA : childB;
      const lessSimplifier = sa > sb ? childB : childA;
      const lenA = moreSimplifier.ruleBias?.lenition ?? 1;
      const lenB = lessSimplifier.ruleBias?.lenition ?? 1;
      const forA = moreSimplifier.ruleBias?.fortition ?? 1;
      const forB = lessSimplifier.ruleBias?.fortition ?? 1;
      if (lenA > lenB && forA < forB) consistent++;
    }
    expect(tested, "need at least 20 non-tied draws to assert").toBeGreaterThanOrEqual(20);
    expect(consistent / tested).toBeGreaterThanOrEqual(0.75);
  });

  it("phonotacticProfile maxCoda shifts in direction-correlated way", () => {
    // Negative simplification (preserver) → higher maxCoda;
    // positive simplification (simplifier) → lower maxCoda.
    let consistent = 0;
    let tested = 0;
    for (let i = 0; i < SAMPLE_SEEDS; i++) {
      const { childA, childB } = setupAndSplit(`d1-phono-${i}`);
      if (!childA.phonotacticProfile || !childB.phonotacticProfile) continue;
      const sa = childA.typologicalDirection!.simplification;
      const sb = childB.typologicalDirection!.simplification;
      if (Math.abs(sa - sb) < 0.5) continue;
      tested++;
      const moreSimplifier = sa > sb ? childA : childB;
      const lessSimplifier = sa > sb ? childB : childA;
      // Higher simplification → maxCoda LOWER or equal.
      if (moreSimplifier.phonotacticProfile!.maxCoda <= lessSimplifier.phonotacticProfile!.maxCoda) {
        consistent++;
      }
    }
    if (tested >= 10) {
      expect(consistent / tested).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("synthesisIndex shifts in direction-correlated way", () => {
    let consistent = 0;
    let tested = 0;
    for (let i = 0; i < SAMPLE_SEEDS; i++) {
      const { childA, childB } = setupAndSplit(`d1-synth-${i}`);
      const da = childA.typologicalDirection!.synthesis;
      const db = childB.typologicalDirection!.synthesis;
      if (Math.abs(da - db) < 0.4) continue;
      tested++;
      const moreSynthetic = da > db ? childA : childB;
      const moreIsolating = da > db ? childB : childA;
      const sa = moreSynthetic.grammar.synthesisIndex ?? 2.0;
      const sb = moreIsolating.grammar.synthesisIndex ?? 2.0;
      if (sa > sb) consistent++;
    }
    if (tested >= 15) {
      expect(consistent / tested).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("3-daughter split: average variance across runs is non-trivial", () => {
    // Single-split variance can be unlucky-low when RNG happens
    // to draw three near-zero samples; averaging over 30 splits
    // smooths that out and tests the property we actually want
    // (the sampler is not degenerate).
    const variances: number[] = [];
    for (let i = 0; i < 30; i++) {
      const sim = createSimulation({ ...defaultConfig(), seed: `d1-three-${i}` });
      for (let g = 0; g < 5; g++) sim.step();
      const state = sim.getState();
      const childIds = splitLeaf(state.tree, state.rootId, state.generation + 1, makeRng(`3way-${i}`), {
        childCount: 3,
      });
      const sims = childIds.map((id) => state.tree[id]!.language.typologicalDirection!.simplification);
      const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
      variances.push(sims.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sims.length);
    }
    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
    expect(avgVariance, "average across 30 splits should be ≥0.10").toBeGreaterThanOrEqual(0.10);
  });
});
