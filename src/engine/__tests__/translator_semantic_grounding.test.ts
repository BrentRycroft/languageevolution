import { describe, it, expect } from "vitest";
import {
  nearestLexicalisedMeaning,
  SEMANTIC_GROUNDING_THRESHOLD,
} from "../semantics/grounding";
import { lookupFormWithResolution } from "../lexicon/lookup";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { tHas as lexHas, tForm as lexGet } from "../lexicon/__tests__/glossSeam";

/**
 * Continuous meaning model — translator surfaces the nearest existing word.
 *
 * When a concept isn't lexicalised, the translator reuses the semantically CLOSEST
 * word the language already has (cosine over the shipped distributional embedding)
 * before coining a fresh form. "truck" against the English seed has no entry but "car"
 * does, and they sit adjacent in the embedding, so the translator surfaces the car-word
 * rather than inventing an opaque truck-word.
 *
 * G1 note: 'truck' is now a REGISTERED concept whose geometric colexWith includes 'car',
 * so it resolves at the registry-colexification rung (glossNote "↔ car") — one rung
 * before the anchor-grounding rung ("≈"). Both reuse an existing word with no coinage;
 * the `nearestLexicalisedMeaning` grounding function (tested directly below) is unchanged.
 */
describe("translator — nearest-existing-word grounding", () => {
  const sim = createSimulation(presetEnglish());
  const lang = sim.getState().tree[sim.getState().rootId]!.language;

  it("seed has 'car' but not 'truck' (precondition)", () => {
    expect(lexHas(lang, "car")).toBe(true);
    expect(lexHas(lang, "truck")).toBe(false);
  });

  it("nearestLexicalisedMeaning finds the closest existing word above threshold", () => {
    const g = nearestLexicalisedMeaning(lang, "truck");
    expect(g).not.toBeNull();
    expect(g!.meaning).toBe("car");
    expect(g!.similarity).toBeGreaterThanOrEqual(SEMANTIC_GROUNDING_THRESHOLD);
  });

  it("a missing concept surfaces the nearest existing word, not a coined form", () => {
    const r = lookupFormWithResolution(lang, "truck", { allowFallbackCoinage: true });
    expect(r.resolution).toBe("colex");
    // Reuses an EXISTING word (car), not an invented truck-word.
    expect(r.form).toEqual(lexGet(lang, "car"));
    expect(r.glossNote).toContain("car");
  });

  it("honours the similarity threshold (nothing grounds above an impossible bar)", () => {
    expect(nearestLexicalisedMeaning(lang, "truck", 0.99)).toBeNull();
  });

  it("colex reuse of an existing word is side-effect-free, so read-only callers get it too", () => {
    // allowFallbackCoinage gates only COINAGE (Rung 8). Surfacing an existing
    // colex partner mutates nothing, so a read-only caller receives it as well.
    const r = lookupFormWithResolution(lang, "truck", { allowFallbackCoinage: false });
    expect(r.resolution).toBe("colex");
    expect(r.form).toEqual(lexGet(lang, "car"));
  });
});
