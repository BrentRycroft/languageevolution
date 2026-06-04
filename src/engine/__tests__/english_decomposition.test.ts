import { describe, it, expect } from "vitest";
import { buildInitialState } from "../steps/init";
import { presetEnglish } from "../presets/english";
import { lexGet } from "../lexicon/access";

/**
 * MEGA overhaul: modern-English decomposability. "behind" is authored as the locative
 * prefix be- (OE bī "by") + the base "hind", so the morpheme inventory / etymology
 * surfaces be+hind rather than an opaque root — while the recomposed surface form
 * (bɪ + hajnd = bɪhajnd) is identical to the seedLexicon entry, so nothing else moves.
 */
describe("English decomposition — behind = be- + hind", () => {
  const lang = buildInitialState(presetEnglish()).tree["L-0"]!.language;

  it("records behind's structure as the be- prefix + hind base", () => {
    const rec = lang.compounds?.behind;
    expect(rec).toBeDefined();
    expect(rec!.parts).toEqual(["be-", "hind"]);
  });

  it("keeps behind's surface form unchanged (bɪhajnd)", () => {
    expect(lexGet(lang, "behind")).toEqual(["b", "ɪ", "h", "a", "j", "n", "d"]);
  });

  it("treats be- as a bound morpheme (not a standalone word)", () => {
    expect(lang.boundMorphemes?.has("be-")).toBe(true);
  });

  it("has hind as a real base entry distinct from behind", () => {
    expect(lexGet(lang, "hind")).toEqual(["h", "a", "j", "n", "d"]);
  });
});
