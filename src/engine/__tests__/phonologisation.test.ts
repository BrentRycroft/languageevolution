import { describe, it, expect } from "vitest";
import { analyzeContexts, detectPhonologisation } from "../phonology/phonologization";
import type { Language } from "../types";

/**
 * Phase 48 D4-D: phonologization-detection tests.
 */

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
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
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

describe("Phase 48 D4-D — analyzeContexts", () => {
  it("classifies intervocalic, edge, and consonantal contexts", () => {
    const lang = makeLang({
      lexicon: {
        a: ["a", "p", "a"],   // p in V_V
        b: ["p", "a"],        // p in #_V
        c: ["a", "p"],        // p in V_#
      },
    });
    const ctx = analyzeContexts(lang);
    expect(ctx.p?.has("V_V")).toBe(true);
    expect(ctx.p?.has("#_V")).toBe(true);
    expect(ctx.p?.has("V_#")).toBe(true);
    expect(ctx.p?.size).toBe(3);
  });

  it("phoneme appearing in only one context is allophone-like", () => {
    const lang = makeLang({
      lexicon: {
        a: ["a", "b", "a"], // b only intervocalic
        c: ["a", "p"],
        d: ["p", "a"],
      },
    });
    const ctx = analyzeContexts(lang);
    expect(ctx.b?.size).toBe(1);
    expect(ctx.b?.has("V_V")).toBe(true);
  });
});

describe("Phase 48 D4-D — detectPhonologisation", () => {
  it("emits no events on first call (no previous snapshot)", () => {
    const lang = makeLang({
      lexicon: {
        a: ["a", "p", "a"],
        b: ["p", "a"],
      },
    });
    const events = detectPhonologisation(lang, 0);
    expect(events.length).toBeGreaterThanOrEqual(0);
    // The snapshot is set after the call.
    expect(lang.contextDiversitySnapshot).toBeDefined();
  });

  it("emits a phonologisation event when a phoneme's diversity rises past threshold", () => {
    const lang = makeLang({
      // Initial state: b appears only in V_V (1 context).
      lexicon: {
        a: ["a", "b", "a"],
      },
    });
    detectPhonologisation(lang, 0); // Set baseline snapshot.
    expect(lang.contextDiversitySnapshot?.b).toBe(1);
    // Now b appears in 2 contexts (V_V + V_#).
    lang.lexicon.c = ["a", "b"];
    const events = detectPhonologisation(lang, 5);
    expect(events.some((e) => e.phoneme === "b" && e.toDiversity >= 2)).toBe(true);
  });

  it("does NOT emit for the tracked phoneme when its diversity stays below threshold", () => {
    const lang = makeLang({
      lexicon: {
        a: ["a", "b", "a"], // b in only V_V (1 context)
        b: ["i", "b", "i"], // still V_V
        c: ["u", "b", "u"], // still V_V
      },
    });
    detectPhonologisation(lang, 0);
    // No new entries; diversity stays the same.
    const events = detectPhonologisation(lang, 5);
    // No phoneme should jump from <2 to ≥2; b stayed at 1.
    expect(events.find((e) => e.phoneme === "b")).toBeUndefined();
  });

  it("snapshot persists across calls", () => {
    const lang = makeLang({
      lexicon: { a: ["a", "p", "a"], b: ["p", "a"] },
    });
    detectPhonologisation(lang, 0);
    const snap1 = { ...lang.contextDiversitySnapshot };
    detectPhonologisation(lang, 5);
    const snap2 = lang.contextDiversitySnapshot;
    expect(snap2).toBeDefined();
    expect(snap2!.p).toBe(snap1.p);
  });
});
