import { describe, it, expect } from "vitest";
import { languageMorphemes, wordMorphemes } from "../languageMorphemes";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import { presetTokipona } from "../../presets/tokipona";
import { lexPoint } from "../meaningPoint";
import { distanceSq } from "../vec";

function rootLang(cfg: ReturnType<typeof presetEnglish>) {
  const sim = createSimulation(cfg);
  const s = sim.getState();
  return s.tree[s.rootId]!.language;
}

describe("languageMorphemes — composable morpheme set", () => {
  const lang = rootLang(presetEnglish());

  it("includes open-class content roots with live forms + lexPoint points", () => {
    const ms = languageMorphemes(lang);
    const water = ms.find((m) => m.id === "water");
    expect(water).toBeTruthy();
    expect(water!.type).toBe("root");
    expect(water!.form.length).toBeGreaterThan(0);            // live form
    expect(distanceSq(water!.point, lexPoint("water"))).toBe(0); // shared anchor
  });

  it("excludes bound morphemes from roots and lists them as affixes (zero point)", () => {
    const ms = languageMorphemes(lang);
    const ness = ms.find((m) => m.id === "-ness");
    expect(ness).toBeTruthy();
    expect(ness!.type).toBe("suffix");
    expect(ness!.point.every((x) => x === 0)).toBe(true);     // v1: zero point
    // a bound morpheme is never also a root
    expect(ms.filter((m) => m.id === "-ness" && m.type === "root")).toHaveLength(0);
  });

  it("excludes closed-class function words from roots", () => {
    const ms = languageMorphemes(lang);
    expect(ms.find((m) => m.id === "the" && m.type === "root")).toBeFalsy();
  });
});

describe("wordMorphemes — a word's ordered composition (live, per language)", () => {
  it("decomposes a recorded English prefix derivation in surface order (be- + hind)", () => {
    const lang = rootLang(presetEnglish());
    const parts = wordMorphemes(lang, "behind");              // position: prefix → [affix, base]
    expect(parts).not.toBeNull();
    expect(parts!.map((m) => m.id)).toEqual(["be-", "hind"]);
    expect(parts!.every((m) => m.form.length > 0)).toBe(true);
  });

  it("decomposes a Toki Pona compound with Toki Pona forms (agnostic)", () => {
    const lang = rootLang(presetTokipona());
    const parts = wordMorphemes(lang, "computer");            // work + know (pali + sona)
    expect(parts).not.toBeNull();
    expect(parts!.map((m) => m.id)).toEqual(["work", "know"]);
  });

  it("returns null for a monomorphemic word", () => {
    const lang = rootLang(presetEnglish());
    expect(wordMorphemes(lang, "water")).toBeNull();
  });
});
