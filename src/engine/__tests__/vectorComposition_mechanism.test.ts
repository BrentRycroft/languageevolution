import { describe, it, expect } from "vitest";
import { MECHANISMS } from "../genesis/mechanisms";
import { MECHANISM_VECTOR_COMPOSITION } from "../genesis/mechanisms/vectorComposition";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { makeRng } from "../rng";
import type { Language, LanguageTree } from "../types";

/**
 * Track B B4: the vector-composition mechanism is wired into the genesis loop and coins a 2-part
 * compound for an in-vocab gap concept. (That it FIRES live is proven by the deliberate gen-30
 * re-baseline in meaning_layer_baseline.test.ts — all six presets shifted.)
 */
function rootLang(): Language {
  const s = createSimulation(presetEnglish()).getState();
  return s.tree[s.rootId]!.language;
}

describe("MECHANISM_VECTOR_COMPOSITION — gap-driven compositional coinage", () => {
  it("is registered in the genesis mechanism list", () => {
    expect(MECHANISMS).toContain(MECHANISM_VECTOR_COMPOSITION);
  });

  it("coins a 2-part compound for an in-vocab gap concept", () => {
    const lang = rootLang();
    const r = MECHANISM_VECTOR_COMPOSITION.tryCoin(lang, "whale", {} as LanguageTree, makeRng("t"));
    expect(r).not.toBeNull();
    expect(r!.sources?.partMeanings).toHaveLength(2);
    expect(r!.form.length).toBeGreaterThan(0);
  });

  it("returns null for an out-of-vocab target (no real meaning point)", () => {
    const lang = rootLang();
    const r = MECHANISM_VECTOR_COMPOSITION.tryCoin(lang, "zzqq-nope", {} as LanguageTree, makeRng("t"));
    expect(r).toBeNull();
  });
});
