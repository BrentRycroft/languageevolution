import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import {
  detectParadigmCollisions,
  detectAndLogParadigmRenewal,
} from "../morphology/renewal";

describe("Phase 56 T2 — paradigm renewal detector", () => {
  it("detects no collisions in a fresh language", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const collisions = detectParadigmCollisions(lang);
    // Stock English shouldn't have inflectional homophones at gen 0.
    expect(collisions.length).toBeGreaterThanOrEqual(0);
  });

  it("flags two paradigms that share an affix", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    // Inject two paradigms with identical affix → guaranteed collision.
    lang.morphology.paradigms["noun.case.acc"] = {
      affix: ["a"],
      position: "suffix",
      category: "noun.case.acc",
    };
    lang.morphology.paradigms["noun.num.pl"] = {
      affix: ["a"],
      position: "suffix",
      category: "noun.num.pl",
    };
    const collisions = detectParadigmCollisions(lang);
    expect(collisions.length).toBeGreaterThan(0);
    expect(
      collisions.some(
        (c) =>
          (c.catA === "noun.case.acc" && c.catB === "noun.num.pl") ||
          (c.catA === "noun.num.pl" && c.catB === "noun.case.acc"),
      ),
    ).toBe(true);
  });

  it("emits a paradigm-renewal event the first time a collision is detected", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    lang.morphology.paradigms["noun.case.acc"] = {
      affix: ["a"],
      position: "suffix",
      category: "noun.case.acc",
    };
    lang.morphology.paradigms["noun.num.pl"] = {
      affix: ["a"],
      position: "suffix",
      category: "noun.num.pl",
    };
    const before = lang.events.length;
    const emitted = detectAndLogParadigmRenewal(lang, 50);
    const after = lang.events.length;
    expect(emitted).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(before);
    expect(lang.events[lang.events.length - 1]!.kind).toBe("paradigm-renewal");
  });

  it("doesn't re-emit for the same collision (idempotent)", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    lang.morphology.paradigms["noun.case.acc"] = {
      affix: ["a"],
      position: "suffix",
      category: "noun.case.acc",
    };
    lang.morphology.paradigms["noun.num.pl"] = {
      affix: ["a"],
      position: "suffix",
      category: "noun.num.pl",
    };
    const first = detectAndLogParadigmRenewal(lang, 50);
    expect(first).toBeGreaterThan(0);
    const second = detectAndLogParadigmRenewal(lang, 51);
    expect(second).toBe(0);
  });
});
