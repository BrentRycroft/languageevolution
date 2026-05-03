import { describe, it, expect } from "vitest";
import {
  stepVolatility,
  triggerVolatilityUpheaval,
  volatilityMultiplier,
} from "../steps/volatility";
import { makeRng } from "../rng";
import type { Language } from "../types";

function makeLang(): Language {
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
  };
}

describe("Phase 25 — volatility regimes", () => {
  it("volatilityMultiplier returns 1 for languages with no phase set", () => {
    const lang = makeLang();
    expect(volatilityMultiplier(lang)).toBe(1);
  });

  it("stepVolatility seeds an initial phase on first tick", () => {
    const lang = makeLang();
    const rng = makeRng("vol-init");
    expect(lang.volatilityPhase).toBeUndefined();
    stepVolatility(lang, 0, rng);
    expect(lang.volatilityPhase).toBeDefined();
    expect(["stable", "upheaval"]).toContain(lang.volatilityPhase!.kind);
    expect(lang.volatilityPhase!.until).toBeGreaterThan(0);
  });

  it("stable phase multiplier is in 0.4–0.7 range", () => {
    // Force stable by using an rng seed where the upheaval roll fails.
    const lang = makeLang();
    const rng = makeRng("vol-stable-seed");
    stepVolatility(lang, 0, rng);
    if (lang.volatilityPhase?.kind === "stable") {
      expect(lang.volatilityPhase!.multiplier).toBeGreaterThan(0.39);
      expect(lang.volatilityPhase!.multiplier).toBeLessThan(0.71);
    }
  });

  it("triggerVolatilityUpheaval forces an upheaval phase with multiplier 2.5–4.0", () => {
    const lang = makeLang();
    const rng = makeRng("vol-trigger");
    triggerVolatilityUpheaval(lang, 10, rng, "tier promotion");
    expect(lang.volatilityPhase!.kind).toBe("upheaval");
    expect(lang.volatilityPhase!.multiplier).toBeGreaterThanOrEqual(2.5);
    expect(lang.volatilityPhase!.multiplier).toBeLessThanOrEqual(4.0);
    expect(lang.volatilityPhase!.trigger).toBe("tier promotion");
    expect(lang.volatilityPhase!.until).toBeGreaterThan(10);
  });

  it("triggerVolatilityUpheaval is idempotent on already-upheaval languages", () => {
    const lang = makeLang();
    const rng = makeRng("vol-trigger-idem");
    triggerVolatilityUpheaval(lang, 10, rng, "first trigger");
    const original = { ...lang.volatilityPhase! };
    triggerVolatilityUpheaval(lang, 11, rng, "second trigger");
    expect(lang.volatilityPhase).toEqual(original);
  });

  it("phase transitions when generation reaches `until`", () => {
    const lang = makeLang();
    lang.volatilityPhase = {
      kind: "upheaval",
      until: 5,
      multiplier: 3.0,
      trigger: "test",
    };
    const rng = makeRng("vol-transition");
    stepVolatility(lang, 5, rng);
    // Upheaval must end (since gen >= until); next phase rolled.
    // Since rollPhase always returns to stable from upheaval, expect stable.
    expect(lang.volatilityPhase?.kind).toBe("stable");
    expect(lang.volatilityPhase?.until).toBeGreaterThan(5);
  });

  it("logs an upheaval-begin event with multiplier and trigger", () => {
    const lang = makeLang();
    const rng = makeRng("vol-event");
    triggerVolatilityUpheaval(lang, 50, rng, "Norman conquest");
    const upheaval = lang.events.find((e) =>
      e.description.includes("volatility upheaval begins"),
    );
    expect(upheaval).toBeDefined();
    expect(upheaval!.description).toContain("Norman conquest");
    expect(upheaval!.description).toMatch(/×\d/);
  });
});
