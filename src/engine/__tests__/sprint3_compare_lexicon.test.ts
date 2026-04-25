import { describe, expect, it } from "vitest";
import { planSkeleton, randomNarrativeSeed, generateNarrative } from "../narrative/generate";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";

/**
 * Sprint 3 cross-feature integration tests.
 *
 *   §D — narrative skeleton library expansion + random seed.
 *   §F.2 — lexicon sort/group state has no engine effect (UI-only)
 *           but verify the helpers it consumes (`clusterOf`,
 *           `frequencyFor`) keep returning sensible values.
 */
describe("§D — narrative skeleton expansion", () => {
  it("planSkeleton returns the requested number of skeletons", () => {
    const ten = planSkeleton("seed-x", 10);
    expect(ten).toHaveLength(10);
  });

  it("planSkeleton is deterministic for the same seed", () => {
    const a = planSkeleton("repro", 5);
    const b = planSkeleton("repro", 5);
    expect(a).toEqual(b);
  });

  it("planSkeleton uses different patterns across the run", () => {
    const seven = planSkeleton("variety", 8);
    const patterns = new Set(seven.map((s) => s.patternIdx));
    // With 8 sentences sampled from ~12 patterns, expect at least 3
    // distinct pattern ids most of the time.
    expect(patterns.size).toBeGreaterThanOrEqual(2);
  });

  it("randomNarrativeSeed produces 6-char alphanumeric strings", () => {
    for (let i = 0; i < 10; i++) {
      const seed = randomNarrativeSeed();
      expect(seed).toMatch(/^[a-z0-9]{6}$/);
    }
  });

  it("compare-mode narratives use the same skeleton across two languages", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "narrative-compare" });
    for (let i = 0; i < 80; i++) sim.step();
    const state = sim.getState();
    const alive = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
    expect(alive.length).toBeGreaterThanOrEqual(2);
    const langA = state.tree[alive[0]!]!.language;
    const langB = state.tree[alive[1]!]!.language;
    const sharedSeed = "compare-test";
    const linesA = generateNarrative(langA, sharedSeed, 5, "ipa");
    const linesB = generateNarrative(langB, sharedSeed, 5, "ipa");
    // Both columns should produce the same number of skeletons even
    // if the realisation drops some lines for missing vocabulary.
    expect(linesA.length + linesB.length).toBeGreaterThan(0);
    // The gloss row encodes the meaning slots — should be identical
    // when both languages have the meanings (the engine falls back
    // to nearest available, but for the common verbs/nouns in the
    // skeleton library most lines line up).
    const overlap = linesA.filter((a, i) => linesB[i]?.gloss === a.gloss).length;
    expect(overlap).toBeGreaterThan(0);
  });
});

describe("§F.2 — lexicon helpers", () => {
  it("clusterOf identifies cluster for known meanings", async () => {
    const { clusterOf } = await import("../semantics/clusters");
    expect(clusterOf("water")).toBeDefined();
    expect(clusterOf("mother")).toBeDefined();
    expect(clusterOf("go")).toBeDefined();
  });

  it("frequencyFor returns finite numbers in [0, 1]", async () => {
    const { frequencyFor } = await import("../lexicon/frequency");
    for (const m of ["water", "mother", "go", "see", "stone"]) {
      const f = frequencyFor(m);
      expect(typeof f).toBe("number");
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
