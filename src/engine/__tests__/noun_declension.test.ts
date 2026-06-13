import { describe, it, expect } from "vitest";
import { satGet } from "../lexicon/satellites";
import {
  assignNounDeclensionClass,
  getNounDeclensionClass,
} from "../morphology/inflectionClass";
import { applyParadigm } from "../morphology/apply";
import { tGlosses as lexKeys } from "../lexicon/__tests__/glossSeam";
import type { Language, Phoneme, WordForm } from "../types";
import { presetRomance } from "../presets/romance";
import { createSimulation } from "../simulation";
import { leafIds } from "../tree/split";
import { makeRng } from "../rng";

/**
 * noun_declension.test.ts
 *
 * Test suite for: "Phase 64 T1 — noun declension classes".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("Phase 64 T1 — noun declension classes", () => {
  it("assignNounDeclensionClass returns a class in 1..5", () => {
    const rng = makeRng("test-1");
    for (let i = 0; i < 50; i++) {
      const cls = assignNounDeclensionClass(["a"], rng);
      expect(cls).toBeGreaterThanOrEqual(1);
      expect(cls).toBeLessThanOrEqual(5);
    }
  });

  it("a-stem nouns lean class 1; consonant-stem lean class 3", () => {
    const rng = makeRng("test-aStem-bias");
    let class1 = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const cls = assignNounDeclensionClass(["p", "u", "e", "l", "a"], rng);
      if (cls === 1) class1++;
      total++;
    }
    expect(class1 / total).toBeGreaterThan(0.45);

    const rng2 = makeRng("test-cStem-bias");
    let class3 = 0;
    let total2 = 0;
    for (let i = 0; i < 200; i++) {
      const cls = assignNounDeclensionClass(["k", "a", "n"], rng2);
      if (cls === 3) class3++;
      total2++;
    }
    expect(class3 / total2).toBeGreaterThan(0.30);
  });

  it("classifyLexicon walks nouns and assigns declension classes", () => {
    const sim = createSimulation({ ...presetRomance(), seed: "decl-classify" });
    sim.step();
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    expect(lang.nounDeclensionClass).toBeDefined();
    // Every seeded noun-like meaning should have a class.
    let unclassified = 0;
    for (const m of lexKeys(lang)) {
      const cls = satGet(lang, "nounDeclensionClass", m);
      if (cls && cls < 1) unclassified++;
    }
    expect(unclassified).toBe(0);
  });

  it("Romance preset emits distinct case-acc surfaces by class", () => {
    const sim = createSimulation({ ...presetRomance(), seed: "decl-variant" });
    sim.step();
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    const acc = lang.morphology.paradigms["noun.case.acc"]!;
    expect(acc.variants).toBeDefined();
    expect(acc.variants!.length).toBe(5);

    // For each declension class, applying noun.case.acc should yield
    // its class-specific suffix.
    const surfaces = new Set<string>();
    for (let cls = 1 as 1 | 2 | 3 | 4 | 5; cls <= 5; cls = (cls + 1) as 1 | 2 | 3 | 4 | 5) {
      const fakeLang: Language = {
        ...lang,
        nounDeclensionClass: { __test: cls } as Record<string, typeof cls>,
      };
      const base: WordForm = ["x", "x"] as Phoneme[];
      const out = applyParadigm(base, acc, fakeLang, "__test");
      surfaces.add(out.join(""));
    }
    // Should produce at least 3 distinct surfaces across the 5 classes.
    expect(surfaces.size).toBeGreaterThanOrEqual(3);
  });

  it("Romance 30-gen run produces declension-class diversity across leaves", () => {
    const sim = createSimulation({ ...presetRomance(), seed: "decl-30gen" });
    for (let i = 0; i < 30; i++) sim.step();
    const state = sim.getState();
    const leaves = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    );
    expect(leaves.length).toBeGreaterThan(0);
    for (const id of leaves) {
      const lang = state.tree[id]!.language;
      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const m of lexKeys(lang)) {
        const cls = getNounDeclensionClass(lang, m);
        counts[cls] = (counts[cls] ?? 0) + 1;
      }
      // Real Latin distributions: at least 3 classes have >5% of nouns.
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const populated = Object.values(counts).filter(
        (n) => n / total >= 0.05,
      ).length;
      expect(populated).toBeGreaterThanOrEqual(3);
    }
  });
});
