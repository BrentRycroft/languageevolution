import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { idForConcept, invalidateConceptIndexCache } from "../lexicon/conceptIndex";
import { idForGloss, lexFormById } from "../lexicon/access";
import { lexPoint, currentPointForId } from "../semantics/meaningPoint";

describe("S6 — translation resolves a drifted word geometrically", () => {
  it("the form for a concept follows a content word that drifted onto its anchor", () => {
    const lang = createSimulation(presetEnglish()).getState().tree["L-0"]!.language;
    const stoneId = idForGloss(lang, "stone")!;
    const stoneForm = lexFormById(lang, stoneId)!;
    // Glide 'stone' fully onto the 'tree' anchor: 'stone's lexeme now means 'tree' geometrically.
    lang.meaningPoints = { ...(lang.meaningPoints ?? {}), [stoneId]: Array.from(lexPoint("tree")) };
    invalidateConceptIndexCache(lang);
    // The translator's content-word resolution (idForConcept → lexFormById) for 'tree' now yields a
    // lexeme whose current point IS the tree anchor (stone, having drifted in, or tree's own lexeme).
    const treeResolved = idForConcept(lang, "tree")!;
    expect(Array.from(currentPointForId(lang, treeResolved))).toEqual(Array.from(lexPoint("tree")));
    // and 'stone' (now empty geometrically) falls back to its stored id + form:
    expect(idForConcept(lang, "stone")).toBe(stoneId);
    expect(lexFormById(lang, idForConcept(lang, "stone")!)).toEqual(stoneForm);
  });
});
