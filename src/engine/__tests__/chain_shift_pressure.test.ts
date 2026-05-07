import { describe, it, expect } from "vitest";
import {
  computeChainShiftPressure,
  detectChainShiftPressure,
  vowelShiftRateMultiplier,
} from "../phonology/chainShift";
import type { Language } from "../types";

/**
 * Phase 48 D4-C: chain-shift pressure tests.
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

describe("Phase 48 D4-C — computeChainShiftPressure", () => {
  it("uncrowded inventory yields zero pressure for every vowel", () => {
    const lang = makeLang({
      phonemeInventory: {
        segmental: ["a", "i", "u"],
        tones: [],
        usesTones: false,
      },
    });
    const pressure = computeChainShiftPressure(lang);
    expect(pressure.i ?? 0).toBe(0);
    expect(pressure.u ?? 0).toBe(0);
    expect(pressure.a ?? 0).toBe(0);
  });

  it("crowded mid-front cluster yields nonzero pressure", () => {
    const lang = makeLang({
      phonemeInventory: {
        segmental: ["i", "e", "ɛ", "æ", "a"],
        tones: [],
        usesTones: false,
      },
    });
    const pressure = computeChainShiftPressure(lang);
    // Mid-front e/ɛ have multiple front-zone neighbours.
    expect(pressure.e).toBeGreaterThan(0);
    expect(pressure.ɛ).toBeGreaterThan(0);
  });
});

describe("Phase 48 D4-C — detectChainShiftPressure", () => {
  it("emits an event when pressure rises past threshold", () => {
    const lang = makeLang({
      phonemeInventory: {
        segmental: ["a", "i", "u"],
        tones: [],
        usesTones: false,
      },
    });
    detectChainShiftPressure(lang, 0); // baseline
    lang.phonemeInventory = {
      segmental: ["a", "i", "e", "ɛ", "æ", "u"],
      tones: [],
      usesTones: false,
    };
    const events = detectChainShiftPressure(lang, 5);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.toPressure).toBeGreaterThanOrEqual(2);
  });

  it("snapshot persists across calls", () => {
    const lang = makeLang({
      phonemeInventory: {
        segmental: ["a", "i", "u", "e", "o"],
        tones: [],
        usesTones: false,
      },
    });
    detectChainShiftPressure(lang, 0);
    expect(lang.vowelShiftPressure).toBeDefined();
  });
});

describe("Phase 48 D4-C — vowelShiftRateMultiplier", () => {
  it("returns 1.0 for an uncrowded inventory", () => {
    const lang = makeLang({
      phonemeInventory: {
        segmental: ["a", "i", "u"],
        tones: [],
        usesTones: false,
      },
    });
    detectChainShiftPressure(lang, 0);
    expect(vowelShiftRateMultiplier(lang)).toBe(1);
  });

  it("scales above 1 for crowded inventories, capped at 1.5", () => {
    const lang = makeLang({
      phonemeInventory: {
        segmental: ["i", "y", "ɪ", "ʏ", "e", "ø", "ɛ", "œ", "æ", "ɶ", "a", "ɑ", "u", "ɯ"],
        tones: [],
        usesTones: false,
      },
    });
    detectChainShiftPressure(lang, 0);
    const mult = vowelShiftRateMultiplier(lang);
    expect(mult).toBeGreaterThan(1);
    expect(mult).toBeLessThanOrEqual(1.5);
  });
});
