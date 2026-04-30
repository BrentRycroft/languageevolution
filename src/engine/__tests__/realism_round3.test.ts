import { describe, expect, it } from "vitest";
import { isolationFactor } from "../phonology/rate";
import { stressIndex } from "../phonology/stress";
import { narrowTranscribe } from "../phonology/narrow";
import { maybeSuppletion, inflect } from "../morphology/evolve";
import { seedDerivationalSuffixes } from "../lexicon/derivation";
import { makeRng } from "../rng";
import type { Language } from "../types";
import type { Paradigm } from "../morphology/types";

function minimalLanguage(overrides: Partial<Language> = {}): Language {
  return {
    id: "L-test",
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
    phonemeInventory: { segmental: ["p", "t", "k", "m", "a", "e", "i"], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    speakers: 10000,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    ...overrides,
  };
}

describe("realism round 3", () => {
  describe("isolationFactor", () => {
    it("returns 1 for contact-dense neighbours", () => {
      expect(isolationFactor(0)).toBeCloseTo(1, 5);
    });
    it("climbs with distance and saturates at 1.6", () => {
      expect(isolationFactor(200)).toBeCloseTo(1.2, 5);
      expect(isolationFactor(600)).toBeCloseTo(1.6, 5);
      expect(isolationFactor(10_000)).toBeCloseTo(1.6, 5);
    });
    it("returns 1 for unknown distance", () => {
      expect(isolationFactor(undefined)).toBe(1);
    });
  });

  describe("stressIndex", () => {
    it("respects pattern choice", () => {
      const form = ["k", "a", "l", "i", "t", "a"];
      expect(stressIndex(form, "initial")).toBe(1);
      expect(stressIndex(form, "penult")).toBe(3);
      expect(stressIndex(form, "final")).toBe(5);
    });
    it("single-vowel forms ignore pattern", () => {
      expect(stressIndex(["d", "o"], "initial")).toBe(1);
      expect(stressIndex(["d", "o"], "final")).toBe(1);
    });
  });

  describe("narrowTranscribe per-language stress", () => {
    it("places stress according to the language's pattern", () => {
      const lang = minimalLanguage({ stressPattern: "final" });
      const out = narrowTranscribe(["k", "a", "l", "i", "t", "a"], lang);
      expect(out.split(".").findIndex((s) => s.startsWith("ˈ"))).toBe(2);
    });
    it("defaults to penultimate when the field is absent", () => {
      const lang = minimalLanguage({ stressPattern: undefined });
      const out = narrowTranscribe(["k", "a", "l", "i", "t", "a"], lang);
      expect(out.split(".").findIndex((s) => s.startsWith("ˈ"))).toBe(1);
    });
  });

  describe("suppletion", () => {
    it("writes a suppletive form and inflect() reads it", () => {
      const paradigm: Paradigm = {
        affix: ["e", "d"],
        position: "suffix",
        category: "verb.tense.past",
      };
      const lang = minimalLanguage({
        lexicon: { go: ["g", "o"], walk: ["w", "a", "l", "k"] },
        wordFrequencyHints: { go: 0.9, walk: 0.4 },
        morphology: { paradigms: { "verb.tense.past": paradigm } },
      });
      const rng = makeRng("seed-sup");
      const fired = maybeSuppletion(lang, rng, 1);
      expect(fired).not.toBeNull();
      expect(fired!.meaning).toBe("go");
      expect(fired!.donorMeaning).toBe("walk");
      const inflected = inflect(lang.lexicon["go"]!, paradigm, lang, "go");
      expect(inflected).toEqual(["w", "a", "l", "k"]);
    });
  });

  describe("language-specific derivational suffixes", () => {
    it("seeds 2-3 suffixes drawn from the language's inventory", () => {
      const lang = minimalLanguage();
      const rng = makeRng("seed-x");
      const suffixes = seedDerivationalSuffixes(lang, rng);
      expect(suffixes.length).toBeGreaterThanOrEqual(2);
      expect(suffixes.length).toBeLessThanOrEqual(3);
      for (const s of suffixes) {
        expect(s.affix.length).toBeGreaterThan(0);
        for (const p of s.affix) {
          expect([...lang.phonemeInventory.segmental, "ə"]).toContain(p);
        }
      }
    });
  });
});
