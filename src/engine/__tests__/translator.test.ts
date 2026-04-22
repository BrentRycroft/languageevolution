import { describe, it, expect } from "vitest";
import { translate } from "../translator/translate";
import type { Language } from "../types";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { DEFAULT_MORPHOLOGY } from "../morphology/defaults";

function sampleLang(): Language {
  return {
    id: "L-0",
    name: "Proto",
    lexicon: {
      water: ["w", "a", "t", "e", "r"],
      fire: ["p", "u", "r"],
      "water-fire": ["w", "a", "t", "e", "r", "p", "u", "r"],
    },
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: {
      paradigms: { ...DEFAULT_MORPHOLOGY.paradigms },
    },
    localNeighbors: {},
  };
}

describe("translator", () => {
  it("returns the direct form for a known meaning", () => {
    const r = translate(sampleLang(), "water");
    expect(r.source).toBe("exact");
    expect(r.form).toBe("water");
  });

  it("inflects when a morphology category is provided", () => {
    const r = translate(sampleLang(), "water", { inflect: "verb.tense.past" });
    expect(r.source).toBe("exact");
    // "water" + past "ed"
    expect(r.form.endsWith("ed")).toBe(true);
  });

  it("falls back to a neighbor meaning", () => {
    const r = translate(sampleLang(), "river");
    expect(r.source).toBe("neighbor");
    expect(r.form).toBe("water");
  });

  it("surfaces a compound containing the target meaning", () => {
    const lang = sampleLang();
    const r = translate(lang, "fire");
    expect(r.source).toBe("exact");
  });

  it("returns missing when nothing matches", () => {
    const r = translate(sampleLang(), "xyzzy");
    expect(r.source).toBe("missing");
  });
});
