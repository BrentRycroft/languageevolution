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
 * MEGA-overhaul (continuous meaning model) — translator nearest-anchor grounding.
 *
 * When a concept isn't lexicalised, the translator now reuses the semantically CLOSEST
 * word the language already has (cosine over the shipped distributional embedding) before
 * coining a fresh form. "truck" against the English seed has no entry but "car" does, and
 * they sit adjacent in the embedding, so the translator surfaces the car-word rather than
 * inventing an opaque truck-word.
 */
describe("translator — nearest-anchor semantic grounding", () => {
  const sim = createSimulation(presetEnglish());
  const lang = sim.getState().tree[sim.getState().rootId]!.language;

  it("seed has 'car' but not 'truck' (precondition)", () => {
    expect(lexHas(lang, "car")).toBe(true);
    expect(lexHas(lang, "truck")).toBe(false);
  });

  it("grounds a missing concept to its nearest lexicalised neighbour", () => {
    const g = nearestLexicalisedMeaning(lang, "truck");
    expect(g).not.toBeNull();
    expect(g!.similarity).toBeGreaterThanOrEqual(SEMANTIC_GROUNDING_THRESHOLD);

    const r = lookupFormWithResolution(lang, "truck", { allowFallbackCoinage: true });
    expect(r.resolution).toBe("colex");
    expect(r.glossNote.startsWith("≈ ")).toBe(true);
    // The surfaced form IS an existing word (no coinage) — the neighbour's form.
    expect(r.form).toEqual(lexGet(lang, g!.meaning));
  });

  it("honours the similarity threshold (nothing grounds above an impossible bar)", () => {
    expect(nearestLexicalisedMeaning(lang, "truck", 0.99)).toBeNull();
  });

  it("does not ground for read-only callers (allowFallbackCoinage: false)", () => {
    const r = lookupFormWithResolution(lang, "truck", { allowFallbackCoinage: false });
    expect(r.form).toBeNull();
  });
});
