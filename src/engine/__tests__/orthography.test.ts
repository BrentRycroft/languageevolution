import { describe, it, expect } from "vitest";
import { romanize, driftOrthography } from "../phonology/orthography";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import type { Language } from "../types";

function baseLang(overrides: Partial<Language> = {}): Language {
  return {
    id: "L-0",
    name: "Proto",
    lexicon: { water: ["w", "a", "θ", "e", "r"] },
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: ["w", "a", "θ", "e", "r"], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    customRules: [],
    orthography: {},
    ...overrides,
  };
}

describe("orthography", () => {
  it("default romanization substitutes digraphs for exotic glyphs", () => {
    const lang = baseLang();
    expect(romanize(["w", "a", "θ", "e", "r"], lang)).toBe("wather");
  });

  it("per-language overrides win over defaults", () => {
    const lang = baseLang({ orthography: { θ: "z" } });
    expect(romanize(["w", "a", "θ"], lang)).toBe("waz");
  });

  it("driftOrthography flips a phoneme's spelling when triggered", () => {
    const lang = baseLang();
    const rng = makeRng("drift");
    // Force probability=1 so it definitely fires.
    const shift = driftOrthography(lang, rng, 1);
    expect(shift).not.toBeNull();
    if (!shift) return;
    expect(lang.orthography[shift.phoneme]).toBe(shift.to);
    expect(shift.from).not.toBe(shift.to);
  });
});
