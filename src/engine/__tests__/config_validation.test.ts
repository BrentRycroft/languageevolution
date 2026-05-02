import { describe, it, expect } from "vitest";
import { validateConfig, summarizeValidation } from "../configValidation";
import { defaultConfig } from "../config";

describe("validateConfig", () => {
  it("default config has no issues", () => {
    const issues = validateConfig(defaultConfig());
    expect(issues).toEqual([]);
  });

  it("flags out-of-range probabilities", () => {
    const cfg = defaultConfig();
    cfg.phonology.globalRate = 1.5;
    cfg.semantics.driftProbabilityPerGeneration = -0.1;
    const issues = validateConfig(cfg);
    expect(issues.some((i) => i.includes("phonology.globalRate"))).toBe(true);
    expect(issues.some((i) => i.includes("semantics.driftProbabilityPerGeneration"))).toBe(true);
  });

  it("flags non-positive maxLeaves", () => {
    const cfg = defaultConfig();
    cfg.tree.maxLeaves = 0;
    const issues = validateConfig(cfg);
    expect(issues.some((i) => i.includes("tree.maxLeaves"))).toBe(true);
  });

  it("flags negative weight in phonology.changeWeights", () => {
    const cfg = defaultConfig();
    const firstId = Object.keys(cfg.phonology.changeWeights)[0]!;
    cfg.phonology.changeWeights[firstId] = -1;
    const issues = validateConfig(cfg);
    expect(issues.some((i) => i.includes("changeWeights"))).toBe(true);
  });

  it("flags an enabled change id with no weight defined", () => {
    const cfg = defaultConfig();
    cfg.phonology.enabledChangeIds = ["non.existent.id", ...cfg.phonology.enabledChangeIds];
    const issues = validateConfig(cfg);
    expect(issues.some((i) => i.includes("non.existent.id"))).toBe(true);
  });

  it("flags invalid seedCulturalTier", () => {
    const cfg = defaultConfig();
    (cfg as { seedCulturalTier?: number }).seedCulturalTier = 5;
    const issues = validateConfig(cfg);
    expect(issues.some((i) => i.includes("seedCulturalTier"))).toBe(true);
  });

  it("flags empty seed", () => {
    const cfg = defaultConfig();
    cfg.seed = "";
    const issues = validateConfig(cfg);
    expect(issues.some((i) => i.includes("seed"))).toBe(true);
  });

  it("flags non-positive yearsPerGeneration", () => {
    const cfg = defaultConfig();
    cfg.yearsPerGeneration = 0;
    const issues = validateConfig(cfg);
    expect(issues.some((i) => i.includes("yearsPerGeneration"))).toBe(true);
  });

  it("summarizeValidation returns null for empty issues, summary string otherwise", () => {
    expect(summarizeValidation([])).toBeNull();
    const s = summarizeValidation(["a", "b"]);
    expect(s).not.toBeNull();
    expect(s!).toContain("a");
    expect(s!).toContain("b");
    expect(s!).toContain("2 issues");
  });
});
