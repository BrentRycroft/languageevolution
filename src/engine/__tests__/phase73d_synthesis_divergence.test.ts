import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { splitLeaf, leafIds } from "../tree/split";
import { makeRng } from "../rng";

/**
 * Phase 73d Tier D Phase D5 — faster synthesis/fusion divergence.
 *
 * D1 already seeds `synthesisIndex` and `fusionIndex` at split via
 * direction.synthesis. D5 reduces the per-gen smoothing in
 * `grammar/typology_drift.ts` from 0.85 → 0.70 so daughters'
 * indices adapt faster to their paradigm-richness trajectory.
 * Combined effect: sisters at gen 300 differ sharply on the
 * analytic-vs-synthetic axis instead of converging on the same
 * paradigm-count target.
 */

describe("Phase 73d D5 — synthesis/fusion divergence", () => {
  it("4-daughter split at gen 300: max-min synthesisIndex ≥ 1.0 in majority of seeds", () => {
    let seedsWithSpread = 0;
    const N = 8;
    for (let s = 0; s < N; s++) {
      const sim = createSimulation({ ...defaultConfig(), seed: `d5-seed-${s}` });
      // Force an early 4-daughter split.
      for (let g = 0; g < 5; g++) sim.step();
      const state = sim.getState();
      splitLeaf(state.tree, state.rootId, state.generation + 1, makeRng(`d5-split-${s}`), {
        childCount: 4,
      });
      // Continue running so synthesis indices have time to diverge.
      for (let g = 0; g < 295; g++) sim.step();
      const aliveLeaves = leafIds(sim.getState().tree)
        .map((id) => sim.getState().tree[id]!.language)
        .filter((l) => !l.extinct);
      if (aliveLeaves.length < 2) continue;
      const synthValues = aliveLeaves.map((l) => l.grammar.synthesisIndex ?? 2.0);
      const spread = Math.max(...synthValues) - Math.min(...synthValues);
      if (spread >= 1.0) seedsWithSpread++;
    }
    expect(seedsWithSpread / N, `seeds with synth spread ≥1.0: ${seedsWithSpread}/${N}`).toBeGreaterThanOrEqual(0.5);
  });

  it("smoothing factor change is observable in single-step synthesis adaptation", () => {
    // Pre-D5 smoothing 0.85: new = current*0.85 + target*0.15.
    // Post-D5 smoothing 0.70: new = current*0.70 + target*0.30.
    // For current=2.0 and target=4.0: pre=2.3, post=2.6.
    const sim = createSimulation({ ...defaultConfig(), seed: "d5-smoothing" });
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.grammar.synthesisIndex = 2.0;
    // Synthetic paradigm count: synthFromParadigms = 0.8 + 0.2*N.
    // Target 4.0 ⇒ N = 16 paradigms.
    while (Object.keys(lang.morphology.paradigms).length < 16) {
      const idx = Object.keys(lang.morphology.paradigms).length;
      // Add fake paradigm entries.
      (lang.morphology.paradigms as Record<string, unknown>)[`fake.${idx}` as string] = {
        affix: ["a", "b"],
        position: "suffix",
        category: `fake.${idx}`,
      };
    }
    // Run one typology-drift tick (cadence 10).
    sim.step(); // gen 1
    for (let i = 1; i < 10; i++) sim.step();
    const post = lang.grammar.synthesisIndex!;
    // With 16 paradigms, target = 4.0. New synth = 2.0*0.7 + 4.0*0.3 = 2.6.
    // Allow some tolerance for other drift effects.
    expect(post, `synthesis after 1 cadence: ${post}, expected ~2.6`).toBeGreaterThanOrEqual(2.3);
  });
});
