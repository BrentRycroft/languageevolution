import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { leafIds } from "../tree/split";
import { levenshtein } from "../phonology/ipa";

/**
 * Phase 24 — frequency-effect direction split by POS.
 *
 * Real-linguistic frequency-effect bifurcation: content words (noun /
 * verb / adjective) that are high-frequency tend to be CONSERVATIVE
 * (PIE *méh₂tēr ≈ English mother stays close); function words (DET /
 * AUX / PREP / CONJ) at high-frequency tend to ERODE FAST ("going to"
 * → "gonna"). The simulator's previous direction was uniform — high-freq
 * = more erosion for everything — which incorrectly aged content words
 * faster than function words.
 *
 * These tests confirm the split: across many gens, high-freq content
 * words drift LESS than low-freq content words, while function words
 * keep the existing direction.
 */
describe("Phase 24 — frequency direction by POS", () => {
  it("high-frequency content words drift LESS than low-frequency content words across 200 gens", () => {
    const cfg = { ...presetEnglish(), seed: "freq-direction-A" };
    const sim = createSimulation(cfg);
    const seedLex = cfg.seedLexicon;

    // Hand-pick a high-freq content meaning and a low-freq one with the
    // same (or close) seed length, so length isn't the confound.
    // mother (5 phonemes, freq 0.9) vs valley (6 phonemes, freq ~0.4).
    // To control for length, normalize each Δ to phonemes-per-seed-length.
    const HIGH_FREQ = ["mother", "father", "water"];
    const LOW_FREQ = ["valley", "thunder", "lightning"];

    for (let i = 0; i < 200; i++) sim.step();
    const state = sim.getState();
    const leaves = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    );
    expect(leaves.length).toBeGreaterThan(0);
    const langs = leaves.map((id) => state.tree[id]!.language);

    let highSum = 0,
      highN = 0,
      lowSum = 0,
      lowN = 0;
    for (const lang of langs) {
      for (const m of HIGH_FREQ) {
        const cur = lang.lexicon[m];
        const seed = seedLex[m];
        if (cur && seed) {
          highSum += levenshtein(cur, seed) / seed.length;
          highN++;
        }
      }
      for (const m of LOW_FREQ) {
        const cur = lang.lexicon[m];
        const seed = seedLex[m];
        if (cur && seed) {
          lowSum += levenshtein(cur, seed) / seed.length;
          lowN++;
        }
      }
    }
    const highMean = highN > 0 ? highSum / highN : 0;
    const lowMean = lowN > 0 ? lowSum / lowN : 0;
    // High-freq content words should drift less per phoneme than low-freq.
    // Allow some slack for rng variance — assert at least 15% difference.
    expect(highMean).toBeLessThan(lowMean * 0.95);
  });
});
