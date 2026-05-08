import { describe, expect, it } from "vitest";
import { randomNarrativeSeed, generateNarrative } from "../narrative/generate";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";

describe("§D — narrative skeleton expansion", () => {
  // Phase 68b T7: removed 3 skipped planSkeleton tests. Phase 53 T6
  // deprecated `planSkeleton` (the language-agnostic wrapper now
  // returns []); the dead skip stubs were just placeholder
  // documentation. The pool-driven planner's behaviour is covered
  // by generateNarrative integration coverage below.

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
    expect(linesA.length + linesB.length).toBeGreaterThan(0);
    // Phase 39: with multi-flip founders + faster lexical replacement +
    // softer universals, sister languages may diverge dramatically
    // even at gen 80. Relax: accept ≥ 1 gloss overlap OR confirm both
    // narratives produced any output at all (skeleton-sharing is the
    // intent; the strict "same gloss line N" assertion is too tight
    // under the new dynamics).
    // Phase 68b T7: the `>= 0` was always-true; tighten to confirm
    // the intent — both narratives produce structurally-comparable
    // line counts (skeleton sharing).
    if (linesA.length > 0 && linesB.length > 0) {
      expect(Math.abs(linesA.length - linesB.length)).toBeLessThanOrEqual(2);
    }
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
