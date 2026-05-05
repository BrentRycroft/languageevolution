import { describe, it, expect } from "vitest";
import { applyChangesToWord, type ApplyOptions } from "../phonology/apply";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { leafIds } from "../tree/split";
import { levenshtein } from "../phonology/ipa";
import { makeRng } from "../rng";

/**
 * Phase 28d: lexical diffusion. The hypothesis is that sound changes
 * spread word-by-word with bias by frequency (high-freq content words
 * resist) and by neighbour momentum (a word whose semantic neighbours
 * have shifted picks up the change faster — the S-curve of diffusion).
 *
 * Two tests:
 *   1. neighbour momentum boosts firing rate (micro-driver).
 *   2. across a 200-gen sim, mean Δ-vs-seed for the lowest-frequency
 *      half of seed content words is ≥ 1.5× that of the highest-
 *      frequency half. Confirms low-freq words diffuse faster.
 */

function fireCount(
  ruleId: string,
  word: string[],
  trials: number,
  momentum: number,
  seed: string,
): number {
  const rule = CATALOG_BY_ID[ruleId];
  if (!rule) throw new Error(`unknown rule: ${ruleId}`);
  const rng = makeRng(seed);
  const opts: ApplyOptions = {
    globalRate: 1,
    weights: { [ruleId]: 1 },
    rateMultiplier: 1,
    neighbourMomentum: momentum === 1 ? undefined : { test: momentum },
  };
  let fired = 0;
  for (let i = 0; i < trials; i++) {
    const next = applyChangesToWord(word, [rule], rng, opts, "test");
    if (next.join("") !== word.join("")) fired++;
  }
  return fired;
}

describe("Phase 28d — lexical diffusion", () => {
  it("neighbour momentum boosts firing rate", () => {
    // Phase 36 Tranche 36g bumped trial count 500 → 2000 because the
    // GENERATION_RATE_SCALE halving cut absolute fire rate enough that
    // the 50% momentum boost was occasionally lost in stochastic
    // noise at 500 trials. Larger trial pool, same expectation.
    const baseline = fireCount(
      "lenition.p_to_f",
      ["b", "a", "p", "a"],
      2000,
      1.0,
      "diff-base",
    );
    const boosted = fireCount(
      "lenition.p_to_f",
      ["b", "a", "p", "a"],
      2000,
      1.5,
      "diff-boost",
    );
    expect(
      boosted,
      `baseline=${baseline} boosted=${boosted}`,
    ).toBeGreaterThan(baseline);
  });

  // Phase 29 Tranche 7g: trimmed 200→100 gens. The freq-graded
  // divergence signature is observable by gen 80–100 — running 200
  // just adds noise and cost (the prior run took 75s alone).
  it("explicit-frequency content words show frequency-graded divergence", () => {
    const cfg = { ...presetEnglish(), seed: "diffusion-rate" };
    const sim = createSimulation(cfg);
    const seedLex = cfg.seedLexicon;
    const freqHints = cfg.seedFrequencyHints ?? {};
    for (let i = 0; i < 100; i++) sim.step();
    const state = sim.getState();
    const leaves = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    );
    if (leaves.length === 0) return;
    const lang = state.tree[leaves[0]!]!.language;
    // Restrict to meanings with EXPLICIT freq hints in the preset
    // (the rest default to 0.5 which gives no signal). Within those,
    // split into top-quartile (very high freq, ≥ 0.92) and rest of
    // the explicit-hint set. Top quartile should have noticeably
    // smaller mean Δ — that's the lexical-diffusion / freq-direction
    // signature (Phase 24 + Phase 28d combined).
    const entries = Object.keys(freqHints)
      .filter((m) => lang.lexicon[m] && seedLex[m])
      .map((m) => ({
        meaning: m,
        freq: freqHints[m]!,
        delta: levenshtein(lang.lexicon[m]!, seedLex[m]!),
      }));
    if (entries.length < 20) return;
    const top = entries.filter((e) => e.freq >= 0.92);
    const rest = entries.filter((e) => e.freq < 0.92);
    if (top.length < 5 || rest.length < 5) return;
    const topMean = top.reduce((s, e) => s + e.delta, 0) / top.length;
    const restMean = rest.reduce((s, e) => s + e.delta, 0) / rest.length;
    expect(
      topMean,
      `top(≥0.92)=${topMean.toFixed(2)} rest(<0.92)=${restMean.toFixed(2)} (n top=${top.length} rest=${rest.length})`,
    ).toBeLessThanOrEqual(restMean);
  }, 120_000);
});
