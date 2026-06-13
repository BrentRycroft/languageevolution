import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { idForGloss } from "../lexicon/access";
import { cloneLanguage } from "../utils/clone";

describe("S4 — WordSense.lexemeId identity", () => {
  it("every sense carries its lexeme's id at seed", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    expect(lang.words!.length).toBeGreaterThan(0);
    for (const w of lang.words!) {
      for (const s of w.senses) {
        expect(s.lexemeId).toBe(idForGloss(lang, s.meaning));
      }
    }
  });

  it("lexemeId survives a deep clone (tree split)", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const clone = cloneLanguage(lang);
    for (let i = 0; i < clone.words!.length; i++) {
      expect(clone.words![i]!.senses[0]!.lexemeId).toBe(lang.words![i]!.senses[0]!.lexemeId);
    }
  });
});
