import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { decayAffixProductivity } from "../morphology/decay";
import { PRODUCTIVITY_THRESHOLD } from "../lexicon/derivation";

describe("Phase 56 T1 — per-affix productivity decay", () => {
  it("doesn't decay when generation is 0 or off the interval", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const r1 = decayAffixProductivity(lang, 0);
    expect(r1.decayed).toBe(0);
    const r2 = decayAffixProductivity(lang, 7);
    expect(r2.decayed).toBe(0);
  });

  it("halves usageCount on suffixes idle past the decay threshold", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    if (!lang.derivationalSuffixes || lang.derivationalSuffixes.length === 0) {
      lang.derivationalSuffixes = [];
    }
    lang.derivationalSuffixes.push({
      affix: ["e", "θ"],
      tag: "-eth",
      category: "abstractNoun",
      position: "suffix",
      productive: true,
      usageCount: 10,
      establishedGeneration: 0,
      lastUsedGeneration: 0,
    });
    // generation=20, idleGens=20, > DECAY_THRESHOLD(15) and on the
    // DECAY_INTERVAL(10) tick. Half it.
    decayAffixProductivity(lang, 20);
    const eth = lang.derivationalSuffixes.find((s) => s.tag === "-eth")!;
    expect(eth.usageCount).toBe(5);
  });

  it("demotes productive=true to false when count drops below threshold", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    if (!lang.derivationalSuffixes) lang.derivationalSuffixes = [];
    // Start at PRODUCTIVITY_THRESHOLD (so half = 1, below threshold).
    lang.derivationalSuffixes.push({
      affix: ["e", "θ"],
      tag: "-eth",
      category: "abstractNoun",
      position: "suffix",
      productive: true,
      usageCount: PRODUCTIVITY_THRESHOLD,
      establishedGeneration: 0,
      lastUsedGeneration: 0,
    });
    const result = decayAffixProductivity(lang, 20);
    const eth = lang.derivationalSuffixes.find((s) => s.tag === "-eth")!;
    expect(result.demoted).toBeGreaterThanOrEqual(1);
    expect(eth.productive).toBe(false);
  });

  it("active suffixes keep their productivity", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    if (!lang.derivationalSuffixes) lang.derivationalSuffixes = [];
    lang.derivationalSuffixes.push({
      affix: ["n", "ɛ", "s"],
      tag: "-active",
      category: "abstractNoun",
      position: "suffix",
      productive: true,
      usageCount: 20,
      establishedGeneration: 0,
      lastUsedGeneration: 18, // recently used
    });
    decayAffixProductivity(lang, 20);
    const active = lang.derivationalSuffixes.find((s) => s.tag === "-active")!;
    expect(active.usageCount).toBe(20);
    expect(active.productive).toBe(true);
  });
});
