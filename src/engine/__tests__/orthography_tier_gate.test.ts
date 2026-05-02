import { describe, it, expect } from "vitest";
import {
  driftOrthography,
  freezeLexicalSpelling,
  romanize,
  tierOrthographyMultiplier,
} from "../phonology/orthography";
import { makeRng } from "../rng";
import type { Language } from "../types";

function makeLang(overrides: Partial<Language> = {}): Language {
  return {
    id: "L",
    name: "Test",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO",
      affixPosition: "suffix",
      pluralMarking: "none",
      tenseMarking: "none",
      hasCase: false,
      genderCount: 0,
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: ["θ", "k", "p", "i"], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    ...overrides,
  };
}

describe("tierOrthographyMultiplier", () => {
  it("returns 0 for tier undefined / 0 / 1", () => {
    expect(tierOrthographyMultiplier(undefined)).toBe(0);
    expect(tierOrthographyMultiplier(0)).toBe(0);
    expect(tierOrthographyMultiplier(1)).toBe(0);
  });

  it("returns 1 for tier 2", () => {
    expect(tierOrthographyMultiplier(2)).toBe(1);
  });

  it("returns 3 for tier 3+", () => {
    expect(tierOrthographyMultiplier(3)).toBe(3);
  });
});

describe("driftOrthography tier gate", () => {
  it("never fires for tier-0 languages", () => {
    const lang = makeLang({ culturalTier: 0 });
    for (let i = 0; i < 100; i++) {
      const r = driftOrthography(lang, makeRng(`t0-${i}`), 0.5);
      if (r) throw new Error("expected no drift at tier 0");
    }
    expect(lang.orthography).toEqual({});
  });

  it("never fires for tier-1 languages", () => {
    const lang = makeLang({ culturalTier: 1 });
    for (let i = 0; i < 100; i++) {
      const r = driftOrthography(lang, makeRng(`t1-${i}`), 0.5);
      if (r) throw new Error("expected no drift at tier 1");
    }
    expect(lang.orthography).toEqual({});
  });

  it("fires at the baseline rate for tier 2", () => {
    const lang = makeLang({ culturalTier: 2 });
    let fires = 0;
    for (let i = 0; i < 200; i++) {
      const r = driftOrthography(lang, makeRng(`t2-${i}`), 0.5);
      if (r) fires++;
    }
    // baseline 0.5 over 200 trials → roughly 100 fires
    expect(fires).toBeGreaterThan(50);
    expect(fires).toBeLessThan(200);
  });

  it("fires more often (~3x) for tier-3 languages than tier-2", () => {
    let t2Fires = 0;
    let t3Fires = 0;
    for (let i = 0; i < 500; i++) {
      const langT2 = makeLang({ culturalTier: 2 });
      const langT3 = makeLang({ culturalTier: 3 });
      if (driftOrthography(langT2, makeRng(`t2x-${i}`), 0.05)) t2Fires++;
      if (driftOrthography(langT3, makeRng(`t3x-${i}`), 0.05)) t3Fires++;
    }
    expect(t3Fires).toBeGreaterThan(t2Fires);
  });
});

describe("freezeLexicalSpelling", () => {
  it("never fires for tier-0/1/2 languages", () => {
    for (const tier of [0, 1, 2] as const) {
      const lang = makeLang({
        culturalTier: tier,
        lexicon: { house: ["h", "a", "w", "s"] },
        wordFrequencyHints: { house: 0.9 },
      });
      for (let i = 0; i < 100; i++) {
        const r = freezeLexicalSpelling(lang, makeRng(`f${tier}-${i}`), 0.5);
        if (r) throw new Error(`unexpected freeze at tier ${tier}`);
      }
      expect(lang.lexicalSpelling).toBeUndefined();
    }
  });

  it("freezes a high-frequency word for tier-3 languages", () => {
    const lang = makeLang({
      culturalTier: 3,
      lexicon: { house: ["h", "a", "w", "s"] },
      wordFrequencyHints: { house: 0.9 },
    });
    let result: { meaning: string; spelling: string } | null = null;
    for (let i = 0; i < 50 && !result; i++) {
      result = freezeLexicalSpelling(lang, makeRng(`f3-${i}`), 1.0);
    }
    expect(result).not.toBeNull();
    expect(result!.meaning).toBe("house");
    expect(result!.spelling.length).toBeGreaterThan(0);
    expect(lang.lexicalSpelling?.house).toBe(result!.spelling);
  });

  it("ignores low-frequency words", () => {
    const lang = makeLang({
      culturalTier: 3,
      lexicon: { obscure: ["o", "b", "s"] },
      wordFrequencyHints: { obscure: 0.2 },
    });
    for (let i = 0; i < 50; i++) {
      const r = freezeLexicalSpelling(lang, makeRng(`fl-${i}`), 1.0);
      expect(r).toBeNull();
    }
  });

  it("doesn't re-freeze a meaning that already has a spelling", () => {
    const lang = makeLang({
      culturalTier: 3,
      lexicon: { house: ["h", "a", "w", "s"] },
      wordFrequencyHints: { house: 0.9 },
      lexicalSpelling: { house: "hous" },
    });
    for (let i = 0; i < 50; i++) {
      const r = freezeLexicalSpelling(lang, makeRng(`fr-${i}`), 1.0);
      expect(r).toBeNull();
    }
    expect(lang.lexicalSpelling?.house).toBe("hous");
  });
});

describe("romanize honours lexicalSpelling", () => {
  it("returns the frozen spelling verbatim regardless of phoneme drift", () => {
    const lang = makeLang({
      culturalTier: 3,
      lexicon: { knight: ["n", "a", "j", "t"] }, // already drifted from /knixt/
      lexicalSpelling: { knight: "knight" },
    });
    const out = romanize(lang.lexicon.knight!, lang, "knight");
    expect(out).toBe("knight");
  });

  it("falls through to per-phoneme romanization when no override", () => {
    const lang = makeLang({ culturalTier: 0 });
    const out = romanize(["k", "a", "t"], lang, "cat");
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toBe("");
  });

  it("works with no meaning passed (legacy callers)", () => {
    const lang = makeLang({ culturalTier: 0 });
    const out = romanize(["k", "a", "t"], lang);
    expect(out.length).toBeGreaterThan(0);
  });
});
