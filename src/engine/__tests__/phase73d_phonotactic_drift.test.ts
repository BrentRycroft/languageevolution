import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { stepPhonotacticDrift } from "../steps/phonotacticDrift";
import { makeRng } from "../rng";
import type { Language } from "../types";

/**
 * Phase 73d Tier D Phase D2 — phonotactic profile drift.
 *
 * Each language's `phonotacticProfile.{maxOnset, maxCoda,
 * maxCluster}` drifts every 20 generations driven by cumulative
 * rule firings. Lenition-heavy daughters lose clusters;
 * fortition-heavy daughters preserve them.
 */

function freshLang(seed: string): Language {
  const sim = createSimulation({ ...defaultConfig(), seed });
  return sim.getState().tree[sim.getState().rootId]!.language;
}

function ensureProfile(lang: Language): void {
  if (!lang.phonotacticProfile) {
    lang.phonotacticProfile = { maxOnset: 3, maxCoda: 4, maxCluster: 4, strictness: 0.4 };
  }
}

describe("Phase 73d D2 — phonotactic drift", () => {
  it("a daughter with lenition-heavy active rules shrinks maxCoda over many cadences", () => {
    const lang = freshLang("d2-lenition");
    ensureProfile(lang);
    lang.activeRules = [
      { id: "r1", family: "lenition" } as never,
      { id: "r2", family: "lenition" } as never,
      { id: "r3", family: "lenition" } as never,
      { id: "r4", family: "deletion" } as never,
      { id: "r5", family: "deletion" } as never,
    ];
    const startCoda = lang.phonotacticProfile!.maxCoda;
    const startCluster = lang.phonotacticProfile!.maxCluster;
    const rng = makeRng("d2-len-rng");
    // 15 cadences = 300 gens; with 35% per-cadence chance of -1
    // maxCoda, expected drift ≈ -5 (clamped to 0).
    for (let i = 1; i <= 15; i++) {
      stepPhonotacticDrift(lang, i * 20, rng);
    }
    expect(lang.phonotacticProfile!.maxCoda, `maxCoda ${lang.phonotacticProfile!.maxCoda} should be ≤ start ${startCoda}`).toBeLessThanOrEqual(startCoda);
    // Combined coda+cluster reduction should add to at least 2.
    const totalReduction =
      (startCoda - lang.phonotacticProfile!.maxCoda) +
      (startCluster - lang.phonotacticProfile!.maxCluster);
    expect(totalReduction, "combined coda+cluster reduction should be ≥2 over 300 gens").toBeGreaterThanOrEqual(2);
  });

  it("a daughter with fortition-heavy active rules preserves or expands clusters", () => {
    const lang = freshLang("d2-fortition");
    ensureProfile(lang);
    lang.activeRules = [
      { id: "r1", family: "fortition" } as never,
      { id: "r2", family: "fortition" } as never,
      { id: "r3", family: "fortition" } as never,
      { id: "r4", family: "gemination" } as never,
    ];
    const startCoda = lang.phonotacticProfile!.maxCoda;
    const rng = makeRng("d2-fort-rng");
    for (let i = 1; i <= 15; i++) {
      stepPhonotacticDrift(lang, i * 20, rng);
    }
    // Should NOT have decreased meaningfully; might have increased.
    expect(lang.phonotacticProfile!.maxCoda).toBeGreaterThanOrEqual(startCoda - 1);
  });

  it("drift only fires on multiples of cadence (20 gens)", () => {
    const lang = freshLang("d2-cadence");
    ensureProfile(lang);
    lang.activeRules = [
      { id: "r1", family: "lenition" } as never,
      { id: "r2", family: "deletion" } as never,
    ];
    const startCoda = lang.phonotacticProfile!.maxCoda;
    const rng = makeRng("d2-cad-rng");
    // 19 non-cadence calls should produce no change.
    for (let g = 1; g <= 19; g++) {
      stepPhonotacticDrift(lang, g, rng);
    }
    expect(lang.phonotacticProfile!.maxCoda).toBe(startCoda);
  });

  it("clamps maxCoda at 0 and maxOnset at 1", () => {
    const lang = freshLang("d2-clamp");
    lang.phonotacticProfile = { maxOnset: 1, maxCoda: 0, maxCluster: 1, strictness: 0.4 };
    lang.activeRules = [
      { id: "r1", family: "lenition" } as never,
      { id: "r2", family: "deletion" } as never,
      { id: "r3", family: "deletion" } as never,
    ];
    const rng = makeRng("d2-clamp-rng");
    for (let i = 1; i <= 30; i++) {
      stepPhonotacticDrift(lang, i * 20, rng);
    }
    expect(lang.phonotacticProfile!.maxCoda).toBeGreaterThanOrEqual(0);
    expect(lang.phonotacticProfile!.maxCluster).toBeGreaterThanOrEqual(1);
    expect(lang.phonotacticProfile!.maxOnset).toBeGreaterThanOrEqual(1);
  });

  it("clamps maxCoda at 5 and maxCluster at 5", () => {
    const lang = freshLang("d2-ceil");
    lang.phonotacticProfile = { maxOnset: 4, maxCoda: 5, maxCluster: 5, strictness: 0.4 };
    lang.activeRules = [
      { id: "r1", family: "fortition" } as never,
      { id: "r2", family: "fortition" } as never,
      { id: "r3", family: "gemination" } as never,
    ];
    const rng = makeRng("d2-ceil-rng");
    for (let i = 1; i <= 30; i++) {
      stepPhonotacticDrift(lang, i * 20, rng);
    }
    expect(lang.phonotacticProfile!.maxCoda).toBeLessThanOrEqual(5);
    expect(lang.phonotacticProfile!.maxCluster).toBeLessThanOrEqual(5);
    expect(lang.phonotacticProfile!.maxOnset).toBeLessThanOrEqual(4);
  });
});
