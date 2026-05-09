import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { affixCoverageReport, affixCoverageScore } from "../diagnostics/affixCoverage";

/**
 * affix_coverage.test.ts
 *
 * Test suite for: "Phase 56 T3 — affix coverage diagnostic".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("Phase 56 T3 — affix coverage diagnostic", () => {
  it("returns an entry for every DerivationCategory", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const report = affixCoverageReport(lang);
    // 16 categories per the enum.
    expect(Object.keys(report).length).toBeGreaterThanOrEqual(16);
  });

  it("flags present + productive correctly for stock English", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const report = affixCoverageReport(lang);
    // English seeds -ness, -ship, -hood (abstractNoun, productive).
    expect(report.abstractNoun.present).toBe(true);
    expect(report.abstractNoun.productive).toBe(true);
    expect(report.abstractNoun.affixTags.length).toBeGreaterThan(0);
  });

  it("affixCoverageScore returns 0..1", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const score = affixCoverageScore(lang);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("a language with no derivational suffixes scores 0", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    lang.derivationalSuffixes = [];
    expect(affixCoverageScore(lang)).toBe(0);
  });

  it("the diagnostic doesn't mutate state", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const before = JSON.stringify(lang.derivationalSuffixes);
    affixCoverageReport(lang);
    affixCoverageScore(lang);
    expect(JSON.stringify(lang.derivationalSuffixes)).toBe(before);
  });
});
