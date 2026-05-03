import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { leafIds } from "../tree/split";
import { levenshtein } from "../phonology/ipa";

/**
 * Phase 23 regression: 5000 years (200 generations) of evolution should
 * produce meaningful lexical divergence. The simulator's central job is
 * language change/divergence; if the average word stays within 1
 * Levenshtein step of the seed across 200 gens, something is silently
 * suppressing accumulated change. Pre-fix audit showed mean Δ ≈ 0.5,
 * post-fix shows ≈ 2.5–3.0.
 *
 * This test pins the floor at 1.5 to allow some natural variation per
 * seed while still catching the "everything reverts" regression.
 */
function meanDelta(
  lang: import("../types").Language,
  seedLex: import("../types").Lexicon,
): number {
  let total = 0;
  let n = 0;
  for (const m of Object.keys(seedLex)) {
    const cur = lang.lexicon[m];
    const seed = seedLex[m];
    if (!cur || !seed) continue;
    total += levenshtein(cur, seed);
    n++;
  }
  return n > 0 ? total / n : 0;
}

function pairwiseMeanDistance(
  langs: import("../types").Language[],
  seedLex: import("../types").Lexicon,
): number {
  if (langs.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < langs.length; i++) {
    for (let j = i + 1; j < langs.length; j++) {
      let d = 0;
      let n = 0;
      for (const meaning of Object.keys(seedLex)) {
        const fa = langs[i]!.lexicon[meaning];
        const fb = langs[j]!.lexicon[meaning];
        if (!fa || !fb) continue;
        d += levenshtein(fa, fb);
        n++;
      }
      if (n > 0) {
        total += d / n;
        pairs++;
      }
    }
  }
  return pairs > 0 ? total / pairs : 0;
}

describe("Phase 23 — divergence regression", () => {
  it("after 200 generations, mean lexical Δ vs seed is at least 1.5 phonemes/word", () => {
    const cfg = { ...presetEnglish(), seed: "divergence-regression-A" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 200; i++) sim.step();
    const state = sim.getState();
    const seedLex = cfg.seedLexicon;
    const leaves = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    );
    expect(leaves.length).toBeGreaterThan(0);
    const langs = leaves.map((id) => state.tree[id]!.language);
    const deltas = langs.map((l) => meanDelta(l, seedLex));
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    // Pre-Phase-23: ~0.5. Post-fix: 2.5–3.0. Floor at 1.5 to catch the
    // contagion-revert regression while tolerating per-seed variation.
    expect(avg).toBeGreaterThan(1.5);
  });

  it("after 200 generations, sister daughters diverge from each other (pairwise Δ ≥ 0.8)", () => {
    const cfg = { ...presetEnglish(), seed: "divergence-regression-B" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 200; i++) sim.step();
    const state = sim.getState();
    const seedLex = cfg.seedLexicon;
    const leaves = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    );
    if (leaves.length < 2) {
      // No tree split happened; skip.
      return;
    }
    const langs = leaves.map((id) => state.tree[id]!.language);
    const pw = pairwiseMeanDistance(langs, seedLex);
    // Pre-fix: 0.33. Post-fix: 1.3–1.7. Floor at 0.8.
    expect(pw).toBeGreaterThan(0.8);
  });

  it("over 50 generations a high-frequency word's form should change at least once and stay changed", () => {
    const cfg = { ...presetEnglish(), seed: "divergence-regression-C" };
    const sim = createSimulation(cfg);
    const seedForm = cfg.seedLexicon["water"]!.join("");

    let everChanged = false;
    let endChanged = false;
    for (let i = 0; i < 100; i++) {
      sim.step();
      const leaves = leafIds(sim.getState().tree).filter(
        (id) => !sim.getState().tree[id]!.language.extinct,
      );
      if (leaves.length === 0) break;
      const lang = sim.getState().tree[leaves[0]!]!.language;
      const cur = lang.lexicon["water"]?.join("") ?? "";
      if (cur !== seedForm) everChanged = true;
    }
    const finalLeaves = leafIds(sim.getState().tree).filter(
      (id) => !sim.getState().tree[id]!.language.extinct,
    );
    if (finalLeaves.length > 0) {
      const finalLang = sim.getState().tree[finalLeaves[0]!]!.language;
      const finalForm = finalLang.lexicon["water"]?.join("") ?? "";
      endChanged = finalForm !== seedForm;
    }
    expect(everChanged).toBe(true);
    // Pre-Phase-23: changes happened but were reverted within 2-3 gens,
    // so the final state often matched the seed exactly. Post-fix: at
    // least one accumulated change should still be visible at gen 100.
    expect(endChanged).toBe(true);
  });
});
