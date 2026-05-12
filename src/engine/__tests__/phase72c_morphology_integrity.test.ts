import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetRomance } from "../presets/romance";
import { inflect } from "../morphology/evolve";
import type { Paradigm } from "../morphology/types";

/**
 * phase72c_morphology_integrity.test.ts — Phase 72c verifications
 * for empty-affix paradigm guard and verb-theme reanalysis.
 */

describe("Phase 72c-1 — empty-affix paradigm bails to bare stem", () => {
  it("paradigm with affix:[] and no variants returns base unchanged", () => {
    const cfg = presetRomance();
    cfg.seed = "p72c-empty";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const stem = ["k", "a"];
    const emptyParadigm: Paradigm = {
      category: "noun.case.acc",
      kind: "affix",
      position: "suffix",
      affix: [],
    };
    const result = inflect(stem, emptyParadigm, lang, "test");
    expect(result).toEqual(stem);
  });

  it("paradigm with all variants empty returns base unchanged", () => {
    const cfg = presetRomance();
    cfg.seed = "p72c-empty-variants";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const stem = ["k", "a"];
    const emptyParadigm: Paradigm = {
      category: "noun.case.gen",
      kind: "affix",
      position: "suffix",
      affix: [],
      variants: [
        { affix: [], when: "class:1" },
        { affix: [], when: "class:2" },
      ],
    };
    const result = inflect(stem, emptyParadigm, lang, "test");
    expect(result).toEqual(stem);
  });

  it("paradigm with NON-empty primary affix still inflects normally", () => {
    const cfg = presetRomance();
    cfg.seed = "p72c-nonempty";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const stem = ["k", "a"];
    const goodParadigm: Paradigm = {
      category: "verb.tense.past",
      kind: "affix",
      position: "suffix",
      affix: ["β", "i"],
    };
    const result = inflect(stem, goodParadigm, lang, "test");
    // result should contain at least the original stem; affix attached
    expect(result.length).toBeGreaterThan(stem.length);
  });

  it("paradigm with empty primary but a non-empty variant inflects normally", () => {
    const cfg = presetRomance();
    cfg.seed = "p72c-mixed";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const stem = ["k", "a"];
    const mixedParadigm: Paradigm = {
      category: "verb.tense.past",
      kind: "affix",
      position: "suffix",
      affix: [],
      variants: [
        { affix: ["t"], when: "vowel-final" },
      ],
    };
    const result = inflect(stem, mixedParadigm, lang, "test");
    // Phase 72 methodological audit D-A3: pre-fix this asserted `>=`,
    // which passes even if the variant is NOT applied (result equals
    // stem length). Now we strictly assert `>` to prove the variant
    // affix ["t"] was actually appended.
    // Stem is vowel-final ("a") so the variant ["t"] should fire.
    expect(result.length).toBeGreaterThan(stem.length);
  });
});

describe("Phase 72c-2 — verb-theme reanalysis on phonology drift", () => {
  it("Romance verbThemes always preserve at least the proto themes (head)", () => {
    const cfg = presetRomance();
    cfg.seed = "p72c-themes";
    const sim = createSimulation(cfg);
    const protoBefore = sim.getState().tree["L-0"]!.language;
    const initialHead = protoBefore.grammar.verbThemes?.[0];
    expect(initialHead).toBeDefined();
    for (let i = 0; i < 100; i++) sim.step();
    const protoAfter = sim.getState().tree["L-0"]!.language;
    // The first theme (proto) is preserved across the run; secondary
    // entries may be added or pruned by reanalysis.
    expect(protoAfter.grammar.verbThemes).toBeDefined();
    if (initialHead && protoAfter.grammar.verbThemes) {
      expect(protoAfter.grammar.verbThemes[0]).toEqual(initialHead);
    }
  });
});
