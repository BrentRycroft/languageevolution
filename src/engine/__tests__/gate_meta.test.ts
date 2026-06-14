import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { signature } from "./signature";
import { withinBand, type MetricBand } from "./metric_bands.snapshot";

/**
 * Meta-tests: prove the G0 gates are NOT vacuous — they fail when they should.
 */
describe("G0 gate meta-tests", () => {
  it("signature() discriminates: evolution changes the signature", () => {
    // Prove signature() is non-vacuous — it distinguishes an evolved state from
    // gen-0. NB: a SINGLE step is not always enough (english's earliest
    // generations are phonologically quiet — gen-1 and gen-2 hash identically),
    // so step until a change appears within a bounded window (it does by ~gen-4).
    const a = createSimulation(presetEnglish());
    const gen0 = signature(a);
    let changed = false;
    for (let i = 0; i < 10 && !changed; i++) {
      a.step();
      if (signature(a) !== gen0) changed = true;
    }
    expect(changed, "english's signature must change within 10 gens of evolution").toBe(true);
  });

  it("a reproducibility break would be caught (differing signatures fail equality)", () => {
    const a = createSimulation(presetEnglish());
    const b = createSimulation(presetEnglish());
    for (let i = 0; i < 3; i++) { a.step(); b.step(); }
    const same = signature(a) === signature(b);
    expect(same).toBe(true); // they DO match (control)
    // and a divergence would be detectable:
    a.step();
    expect(signature(a) === signature(b)).toBe(false);
  });

  it("withinBand catches a perturbation outside the band", () => {
    const b: MetricBand = { value: 30, band: 4, absolute: true };
    expect(withinBand(30, b)).toBe(true);
    expect(withinBand(31, b)).toBe(true);
    expect(withinBand(40, b)).toBe(false); // perturbation → out of band
    const rel: MetricBand = { value: 0.6, band: 0.15, absolute: false };
    expect(withinBand(0.6, rel)).toBe(true);
    expect(withinBand(0.9, rel)).toBe(false);
    expect(withinBand(NaN, b)).toBe(false);
  });
});
