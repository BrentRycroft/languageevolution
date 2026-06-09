import { describe, it, expect } from "vitest";
import { composeForGap, GAP_RELATEDNESS_COS } from "../gapComposition";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import { meaningPointFor, lexPoint } from "../meaningPoint";
import { cosineFixed } from "../vec";
import { tHas as lexHas, tForm as lexGet } from "../../lexicon/__tests__/glossSeam";
import type { Language, SimulationConfig } from "../../types";

function rootLang(cfg: SimulationConfig): Language {
  const s = createSimulation(cfg).getState();
  return s.tree[s.rootId]!.language;
}

describe("composeForGap — vector-composition coinage", () => {
  const lang = rootLang(presetEnglish());
  // "whale" is unseeded but in-vocab (real GloVe point); its nearest related roots are animals
  // (fish/bird/…), so it composes into a kenning-style neologism.
  const TARGET = "whale";

  it("composes a needed concept from two related existing roots", () => {
    const g = composeForGap(lang, TARGET);
    expect(g).not.toBeNull();
    expect(g!.parts).toHaveLength(2);
    // both parts are real lexemes in the language
    for (const p of g!.parts) expect(lexHas(lang, p)).toBe(true);
    // the assembled form is exactly the two parts' live forms concatenated (modifier + head)
    const [mod, head] = g!.parts;
    expect(g!.form).toEqual([...lexGet(lang, mod)!, ...lexGet(lang, head)!]);
  });

  it("only compounds from genuinely related roots (both clear the cosine bar)", () => {
    const g = composeForGap(lang, TARGET);
    const target = meaningPointFor(lang, TARGET);
    for (const p of g!.parts) {
      expect(cosineFixed(target, lexPoint(p))).toBeGreaterThanOrEqual(GAP_RELATEDNESS_COS);
    }
  });

  it("is deterministic — same language + meaning → same parts", () => {
    expect(composeForGap(lang, TARGET)!.parts).toEqual(composeForGap(lang, TARGET)!.parts);
  });

  it("never uses the target meaning itself as a part", () => {
    const g = composeForGap(lang, "fire"); // fire IS a root; must not appear as its own part
    if (g) expect(g.parts).not.toContain("fire");
  });

  it("returns null when no related roots exist (random hash-vector meaning)", () => {
    expect(composeForGap(lang, "zzqqxv-not-a-concept")).toBeNull();
  });
});
