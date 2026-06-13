import { describe, it, expect } from "vitest";
import { lexPoint, sensePoint, meaningPointFor, glideMeaningPoint, GLIDE_DENOM } from "../meaningPoint";
import { fromFloats, subVecs, roundDivVec, sumVecs } from "../vec";
import { embed } from "../embeddings";
import { loadMorphemeSpace } from "../morphemeSpaceLoader";
import type { WordSense } from "../../types";
import type { Language } from "../../types";
import type { LexemeId } from "../../lexicon/lexemeIdentity";

function bareLang(): Language {
  return { meaningPoints: undefined } as unknown as Language;
}

describe("meaningPoint — lexPoint", () => {
  it("a decomposed word sits at its baked morpheme composition", () => {
    const behind = loadMorphemeSpace().wordPoints.get("behind")!;
    expect(Array.from(lexPoint("behind"))).toEqual(Array.from(behind));
  });
  it("a non-decomposed word sits at its quantized GloVe anchor", () => {
    expect(Array.from(lexPoint("water"))).toEqual(Array.from(fromFloats(embed("water"))));
  });
  it("behind's composition reconstructs its anchor (single-occurrence be-)", () => {
    expect(Array.from(lexPoint("behind"))).toEqual(Array.from(fromFloats(embed("behind"))));
  });
  it("is cached — same reference on repeat", () => {
    expect(lexPoint("water")).toBe(lexPoint("water"));
  });
});

describe("meaningPoint — per-lexeme sensePoint", () => {
  const base = { weight: 1, bornGeneration: 0 } as const;
  it("sensePoint falls back to the meaning's static point when nothing has drifted", () => {
    const s: WordSense = { meaning: "water", ...base };
    expect(Array.from(sensePoint(bareLang(), s))).toEqual(Array.from(lexPoint("water")));
  });
  it("sensePoint reflects the drifted point once its lexeme has glided", () => {
    const lang = bareLang();
    const s: WordSense = { meaning: "water", lexemeId: "LX-water" as LexemeId, ...base };
    lang.meaningPoints = { "LX-water": Array.from(lexPoint("fire")) };
    expect(Array.from(sensePoint(lang, s))).toEqual(Array.from(lexPoint("fire")));
  });
});

describe("meaningPoint — meaningPointFor / glideMeaningPoint", () => {
  it("meaningPointFor falls back to the static lexPoint with no override", () => {
    expect(Array.from(meaningPointFor(bareLang(), "water"))).toEqual(Array.from(lexPoint("water")));
  });
  it("meaningPointFor returns the stored override when present", () => {
    const lang = bareLang();
    lang.meaningPoints = { water: Array.from(lexPoint("fire")) };
    expect(Array.from(meaningPointFor(lang, "water"))).toEqual(Array.from(lexPoint("fire")));
  });
  it("glideMeaningPoint moves a meaning 1/GLIDE_DENOM toward the target and records it", () => {
    const lang = bareLang();
    const from = lexPoint("water");
    const toward = lexPoint("fire");
    glideMeaningPoint(lang, "water", "fire");
    const expected = sumVecs([from, roundDivVec(subVecs(toward, from), GLIDE_DENOM)]);
    expect(lang.meaningPoints!["water"]).toEqual(Array.from(expected));
  });
  it("repeated glides accumulate (the point keeps moving toward the target)", () => {
    const lang = bareLang();
    glideMeaningPoint(lang, "water", "fire");
    const after1 = lang.meaningPoints!["water"]!.slice();
    glideMeaningPoint(lang, "water", "fire");
    const after2 = lang.meaningPoints!["water"]!;
    const dist = (p: number[]) => {
      const f = Array.from(lexPoint("fire"));
      return p.reduce((s, x, i) => s + (x - f[i]!) ** 2, 0);
    };
    expect(dist(after2)).toBeLessThan(dist(after1));
  });
});
