import { describe, it, expect } from "vitest";
import {
  assignInflectionClass,
  classifyLexicon,
  getInflectionClass,
} from "../morphology/inflectionClass";
import { presetEnglish } from "../presets/english";
import { presetRomance } from "../presets/romance";
import { createSimulation } from "../simulation";
import { leafIds } from "../tree/split";
import { makeRng } from "../rng";

describe("Phase 29 Tranche 5e — inflection classes", () => {
  it("assignInflectionClass picks a class in 1-4", () => {
    const rng = makeRng("inf-1");
    for (let i = 0; i < 50; i++) {
      const cls = assignInflectionClass(["a", "m", "a"], rng);
      expect(cls).toBeGreaterThanOrEqual(1);
      expect(cls).toBeLessThanOrEqual(4);
    }
  });

  it("vowel-final forms boost class 1 (Latin amāre)", () => {
    const rng = makeRng("inf-2");
    let class1 = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const cls = assignInflectionClass(["m", "a", "n", "a"], rng);
      if (cls === 1) class1++;
      total++;
    }
    // Class 1 base 0.65, +0.2 boost for vowel-final → ~71% of total weight.
    expect(class1 / total).toBeGreaterThan(0.55);
  });

  it("consonant-final forms boost class 3", () => {
    const rng = makeRng("inf-3");
    let class3 = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const cls = assignInflectionClass(["a", "g", "e", "r"], rng);
      if (cls === 3) class3++;
      total++;
    }
    expect(class3 / total).toBeGreaterThan(0.18);
  });

  it("classifyLexicon assigns a class to every meaning in a fresh language", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    expect(lang.inflectionClass).toBeDefined();
    let unclassified = 0;
    for (const m of Object.keys(lang.lexicon)) {
      if (!lang.inflectionClass![m]) unclassified++;
    }
    expect(unclassified).toBe(0);
  });

  it("Romance preset produces a Latin-style class distribution after a 50-gen run", () => {
    const cfg = { ...presetRomance(), seed: "inflection-class-romance" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 50; i++) sim.step();
    const state = sim.getState();
    const leaves = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    );
    expect(leaves.length).toBeGreaterThan(0);
    const lang = state.tree[leaves[0]!]!.language;
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const m of Object.keys(lang.lexicon)) {
      const cls = getInflectionClass(lang, m);
      counts[cls] = (counts[cls] ?? 0) + 1;
    }
    const total = counts[1]! + counts[2]! + counts[3]! + counts[4]!;
    // Class 1 should dominate (Latin-style).
    expect(counts[1]! / total).toBeGreaterThan(0.4);
    // Every class should be represented.
    expect(counts[2]).toBeGreaterThan(0);
    expect(counts[3]).toBeGreaterThan(0);
    expect(counts[4]).toBeGreaterThan(0);
  }, 60_000);

  it("classifyLexicon is idempotent: running twice doesn't reassign", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    const snapshot = JSON.stringify(lang.inflectionClass);
    const rng = makeRng("inf-idempotent");
    classifyLexicon(lang, rng);
    expect(JSON.stringify(lang.inflectionClass)).toBe(snapshot);
  });
});
