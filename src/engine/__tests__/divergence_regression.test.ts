import { describe, it, expect, beforeAll } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { leafIds } from "../tree/split";
import { levenshtein } from "../phonology/ipa";
import type { Language } from "../types";

/**
 * Phase 23 + 23b regression. Five behavioural floors tested against
 * single shared 200-generation runs (Phase 27b-followup: consolidated
 * from 5 separate sims to 2 shared sims to bring total runtime from
 * ~150s to ~45s).
 *
 * The tests pin floors that catch known regressions:
 *   - Phase 23: mean Δ ≥ 1.5; pairwise ≥ 0.8; high-freq word change persists.
 *   - Phase 23b: mean length ≥ 75% of seed; < 12% one-phoneme words.
 */

function meanDelta(
  lang: Language,
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
  langs: Language[],
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

describe("Phase 23/23b — divergence regression (shared sim, multi-assertion)", () => {
  // Single 200-gen run shared across all 200-gen assertions. Reduces
  // total runtime from 5 × ~30s = ~150s to 1 × ~30s = ~30s.
  let langs: Language[] = [];
  let seedLex: import("../types").Lexicon;
  let seedMean = 0;

  beforeAll(() => {
    const cfg = { ...presetEnglish(), seed: "divergence-regression-shared" };
    const sim = createSimulation(cfg);
    seedLex = cfg.seedLexicon;
    const seedLengths = Object.values(seedLex).map((f) => f.length);
    seedMean = seedLengths.reduce((a, b) => a + b, 0) / Math.max(1, seedLengths.length);
    for (let i = 0; i < 200; i++) sim.step();
    const state = sim.getState();
    const leaves = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    );
    langs = leaves.map((id) => state.tree[id]!.language);
  });

  it("alive after 200 generations", () => {
    expect(langs.length).toBeGreaterThan(0);
  });

  it("mean lexical Δ vs seed is at least 1.5 phonemes/word", () => {
    const deltas = langs.map((l) => meanDelta(l, seedLex));
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    // Pre-Phase-23: ~0.5. Post-fix: 2.5–3.0. Floor at 1.5.
    expect(avg).toBeGreaterThan(1.5);
  });

  it("sister daughters diverge from each other (pairwise Δ ≥ 0.8)", () => {
    if (langs.length < 2) return; // skip if no tree split happened
    const pw = pairwiseMeanDistance(langs, seedLex);
    // Pre-fix: 0.33. Post-fix: 1.3–1.7. Floor at 0.8.
    expect(pw).toBeGreaterThan(0.8);
  });

  it("mean word length stays within 25% of the seed (no over-erosion)", () => {
    for (const lang of langs) {
      const lens = Object.values(lang.lexicon).map((f) => f.length);
      const mean = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
      // Pre-Phase-23b: drops to 3.25 (~19% loss) on a 4.03 seed.
      // Post-fix: ~5–12% loss, with content words preserving 4–5 phonemes.
      expect(mean).toBeGreaterThan(seedMean * 0.75);
    }
  });

  it("fewer than 12% of words are 1-phoneme long", () => {
    for (const lang of langs) {
      const lens = Object.values(lang.lexicon).map((f) => f.length);
      const oneCount = lens.filter((n) => n <= 1).length;
      expect(oneCount / lens.length).toBeLessThan(0.12);
    }
  });
});

describe("Phase 23 — high-frequency word persistence (shorter sim)", () => {
  // Standalone 100-gen sim for the persistence trajectory test. Shorter
  // because the assertion only needs 100 gens to demonstrate that
  // accumulated change is not reverted by the contagion-revert bug.
  it("over 100 generations a high-frequency word changes at least once and stays changed", () => {
    const cfg = { ...presetEnglish(), seed: "divergence-regression-trajectory" };
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
    // Pre-Phase-23: changes happened but were reverted within 2-3 gens.
    expect(endChanged).toBe(true);
  });
});
