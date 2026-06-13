import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";

/**
 * keyless_widen_determinism.test.ts — S2b reproducibility canary.
 *
 * Proves REPRODUCIBILITY (same seed → identical output) with keyless participation active — the hard
 * requirement. (Byte-identity vs PRE-S2b is a separate, weaker claim proven per-preset by the RUN_SLOW
 * meaning_layer_baseline; variants is immediate, so a preset that coins + sweeps any keyless word
 * re-bakes its GENN trajectory deliberately.)
 */
describe("S2b — reproducibility with keyless participation", () => {
  it("two identical 30-step english sims produce identical lexicon signatures", () => {
    const sig = () => {
      const sim = createSimulation({ ...presetEnglish(), seed: "s2b-canary" });
      for (let i = 0; i < 30; i++) sim.step();
      const lang = sim.getState().tree[sim.getState().rootId]!.language;
      return JSON.stringify(
        Object.entries(lang.lexemes)
          .map(([id, r]) => [id, r.form])
          .sort(),
      );
    };
    expect(sig()).toBe(sig());
  });
});
