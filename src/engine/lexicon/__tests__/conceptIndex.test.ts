import { describe, it, expect } from "vitest";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import { idForConcept } from "../conceptIndex";
import { idForGloss } from "../access";
import { lexPoint, currentPointForId } from "../../semantics/meaningPoint";

describe("S6 — idForConcept geometric resolver", () => {
  it("equals idForGloss for un-drifted seeded concepts that self-gloss", () => {
    const lang = createSimulation(presetEnglish()).getState().tree["L-0"]!.language;
    for (const m of ["water", "fire", "stone", "tree", "eat", "big"] as const) {
      expect(idForConcept(lang, m)).toBe(idForGloss(lang, m));
    }
  });

  it("falls back to idForGloss for a closed-class / non-anchor lemma", () => {
    const lang = createSimulation(presetEnglish()).getState().tree["L-0"]!.language;
    // 'the' resolves via the stored index, not geometry (function word, no content anchor).
    expect(idForConcept(lang, "the")).toBe(idForGloss(lang, "the"));
  });

  it("follows drift: a content word glided onto another anchor resolves geometrically", () => {
    const lang = createSimulation(presetEnglish()).getState().tree["L-0"]!.language;
    const waterId = idForGloss(lang, "water")!;
    // Glide 'water' fully onto the 'fire' anchor; the concept-index cache is rebuilt per-lang ref.
    lang.meaningPoints = { ...(lang.meaningPoints ?? {}), [waterId]: Array.from(lexPoint("fire")) };
    // 'water's lexeme now emergent-glosses to 'fire', so idForConcept('fire') returns a lexeme whose
    // current point IS fire's anchor:
    const fireResolved = idForConcept(lang, "fire")!;
    expect(Array.from(currentPointForId(lang, fireResolved))).toEqual(Array.from(lexPoint("fire")));
    // and 'water' (now empty geometrically) falls back to its stored id:
    expect(idForConcept(lang, "water")).toBe(waterId);
  });
});
