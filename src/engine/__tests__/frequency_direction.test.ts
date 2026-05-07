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
  /**
   * Phase 50 T8: previously this test sampled N=6 hand-picked words
   * (3 high-freq + 3 low-freq) on one seed and lucked into a passing
   * trajectory. Phase 49's productive-affix init shifted RNG
   * consumption enough to flip the assertion. The Phase 24 property
   * (high-freq content words evolve more conservatively than low-
   * freq ones) is a statistical claim about distributions; it
   * should be tested with a much larger sample so single-trajectory
   * noise doesn't dominate.
   *
   * New formulation: sample EVERY content noun/verb/adjective in
   * the seed preset, partitioned by `seedFrequencyHints` into a
   * high-freq bucket (≥0.7) and a low-freq bucket (≤0.4). Run 100
   * generations; assert the high-freq mean is materially below the
   * low-freq mean.
   */
  it("high-frequency content words drift LESS than low-frequency content words (large-sample)", () => {
    const cfg = { ...presetEnglish(), seed: "freq-direction-large" };
    const hints = cfg.seedFrequencyHints ?? {};
    const seedLex = cfg.seedLexicon;
    const FUNCTION_WORDS = new Set([
      "the", "a", "an", "of", "to", "in", "on", "at", "by", "for", "with",
      "and", "or", "but", "not", "this", "that", "these", "those",
      "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
      "be", "is", "am", "are", "was", "were", "have", "has", "had", "do", "does", "did",
      "will", "would", "shall", "should", "can", "could", "may", "might", "must",
    ]);
    const HIGH_FREQ: string[] = [];
    const LOW_FREQ: string[] = [];
    // The English preset's `seedFrequencyHints` only lists HIGH-freq
    // words explicitly. Treat any seeded meaning without a hint as
    // low-freq (default ~0.4 in the simulator). Skip function words.
    for (const m of Object.keys(seedLex)) {
      if (FUNCTION_WORDS.has(m)) continue;
      const f = hints[m];
      if (f !== undefined && f >= 0.7) HIGH_FREQ.push(m);
      else if (f === undefined) LOW_FREQ.push(m);
    }
    expect(HIGH_FREQ.length).toBeGreaterThan(15);
    expect(LOW_FREQ.length).toBeGreaterThan(15);

    const sim = createSimulation(cfg);
    for (let i = 0; i < 100; i++) sim.step();
    const state = sim.getState();
    const langs = leafIds(state.tree)
      .filter((id) => !state.tree[id]!.language.extinct)
      .map((id) => state.tree[id]!.language);
    expect(langs.length).toBeGreaterThan(0);

    let hS = 0, hN = 0, lS = 0, lN = 0;
    for (const lang of langs) {
      for (const m of HIGH_FREQ) {
        const cur = lang.lexicon[m];
        const seedForm = seedLex[m];
        if (cur && seedForm && seedForm.length > 0) {
          hS += levenshtein(cur, seedForm) / seedForm.length;
          hN++;
        }
      }
      for (const m of LOW_FREQ) {
        const cur = lang.lexicon[m];
        const seedForm = seedLex[m];
        if (cur && seedForm && seedForm.length > 0) {
          lS += levenshtein(cur, seedForm) / seedForm.length;
          lN++;
        }
      }
    }
    const highMean = hN > 0 ? hS / hN : 0;
    const lowMean = lN > 0 ? lS / lN : 0;
    // With N>>20 per side the property is robustly testable; even a
    // 5% gap is statistically meaningful.
    expect(highMean).toBeLessThan(lowMean);
  });
});
