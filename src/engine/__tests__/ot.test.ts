import { describe, it, expect } from "vitest";
import { otScore, otFit, maybeLearnOt, DEFAULT_OT_RANKING } from "../phonology/ot";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import type { Language } from "../types";

function baseLang(overrides: Partial<Language> = {}): Language {
  return {
    id: "L-0",
    name: "Proto",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    customRules: [],
    orthography: {},
    otRanking: DEFAULT_OT_RANKING.slice(),
    lastChangeGeneration: {},
    ...overrides,
  };
}

describe("OT constraints", () => {
  it("a canonical CVCV form scores better than a CCC cluster", () => {
    const cv = otScore(["p", "a", "t", "a"], DEFAULT_OT_RANKING);
    const cc = otScore(["p", "t", "k"], DEFAULT_OT_RANKING);
    expect(cc).toBeGreaterThan(cv);
  });

  it("otFit maps to (0, 1] with CVCV near the top", () => {
    const f = otFit(["p", "a"], baseLang());
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThanOrEqual(1);
  });

  it("maybeLearnOt does nothing when the lexicon is empty", () => {
    const lang = baseLang();
    const rng = makeRng("empty");
    expect(maybeLearnOt(lang, rng, 1)).toBeNull();
  });

  it("maybeLearnOt swaps a pair when the lexicon violates a top constraint", () => {
    // Fill the lexicon with coda-heavy forms so *Coda is violated a lot;
    // learning should demote it.
    const lang = baseLang({
      lexicon: {
        a: ["k", "a", "k", "t"],
        b: ["p", "a", "r", "s"],
        c: ["t", "a", "n", "k"],
        d: ["f", "a", "t", "s"],
      },
    });
    const rng = makeRng("learn");
    const before = lang.otRanking.slice();
    // High probability so a swap fires when conditions are met.
    const shift = maybeLearnOt(lang, rng, 1);
    expect(shift).not.toBeNull();
    if (!shift) return;
    expect(lang.otRanking).not.toEqual(before);
  });
});
