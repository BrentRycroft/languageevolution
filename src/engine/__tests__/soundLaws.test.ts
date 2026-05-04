import { describe, it, expect } from "vitest";
import { recordCorrespondences, topRegularCorrespondences } from "../phonology/soundLaws";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { leafIds } from "../tree/split";
import type { Language } from "../types";

function freshEnglish(): Language {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 29 Tranche 5d — sound correspondence laws", () => {
  it("records a substitution event when a meaning's form changes by one phoneme", () => {
    const lang = freshEnglish();
    lang.correspondences = undefined;
    const before = { test: ["p", "a", "t"] };
    const after = { test: ["f", "a", "t"] };
    recordCorrespondences(lang, before, after, 1);
    expect(lang.correspondences).toBeDefined();
    const entries = Object.values(lang.correspondences!);
    const pToF = entries.find((e) => e.from === "p" && e.to === "f");
    expect(pToF).toBeDefined();
    expect(pToF!.fires).toBe(1);
    expect(pToF!.environment).toBe("initial");
  });

  it("counts identity correspondences for unchanged positions to drive regularity", () => {
    const lang = freshEnglish();
    lang.correspondences = undefined;
    // 5 words, all stable.
    const before: Record<string, string[]> = {};
    const after: Record<string, string[]> = {};
    for (let i = 0; i < 5; i++) {
      before[`w${i}`] = ["b", "a", "t"];
      after[`w${i}`] = ["b", "a", "t"];
    }
    recordCorrespondences(lang, before, after, 1);
    const bIdent = Object.values(lang.correspondences!).find(
      (e) => e.from === "b" && e.to === "b" && e.environment === "initial",
    );
    expect(bIdent).toBeDefined();
    expect(bIdent!.total).toBe(5);
    expect(bIdent!.fires).toBe(0);
  });

  it("topRegularCorrespondences surfaces a shift after enough attestations", () => {
    const lang = freshEnglish();
    lang.correspondences = undefined;
    // 8 words shift /p/ → /f/ initially. 0 don't.
    for (let g = 1; g <= 8; g++) {
      recordCorrespondences(
        lang,
        { [`w${g}`]: ["p", "a"] },
        { [`w${g}`]: ["f", "a"] },
        g,
      );
    }
    const top = topRegularCorrespondences(lang, 5, 0.5, 5);
    const pToF = top.find((c) => c.from === "p" && c.to === "f");
    expect(pToF, JSON.stringify(top)).toBeDefined();
    expect(pToF!.regularity).toBeGreaterThanOrEqual(0.99);
  });

  it("a 100-gen English run produces at least one systematic correspondence", () => {
    const cfg = { ...presetEnglish(), seed: "soundlaw-test" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 100; i++) sim.step();
    const state = sim.getState();
    const leaves = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    );
    expect(leaves.length).toBeGreaterThan(0);
    let foundSystematic = 0;
    for (const id of leaves) {
      const lang = state.tree[id]!.language;
      const top = topRegularCorrespondences(lang, 4, 0.5, 5);
      if (top.length > 0) foundSystematic++;
    }
    expect(foundSystematic).toBeGreaterThan(0);
  }, 60_000);
});
