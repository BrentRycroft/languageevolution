import { describe, it, expect } from "vitest";
import { enforceTypologicalUniversals } from "../grammar/universals";
import { makeRng } from "../rng";
import type { Language } from "../types";

function makeLang(overrides: Partial<Language["grammar"]> = {}): Language {
  return {
    id: "L",
    name: "T",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SOV",
      affixPosition: "suffix",
      pluralMarking: "none",
      tenseMarking: "none",
      hasCase: false,
      genderCount: 0,
      ...overrides,
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

describe("enforceTypologicalUniversals", () => {
  it("U1: SOV + preposition can repair to postposition over many trials", () => {
    const lang = makeLang({ wordOrder: "SOV", caseStrategy: "preposition" });
    let repaired = false;
    for (let i = 0; i < 200; i++) {
      const r = enforceTypologicalUniversals(lang, makeRng(`u1-${i}`));
      if (r.length > 0) {
        repaired = true;
        expect(r[0]!.feature).toBe("caseStrategy");
        expect(r[0]!.to).toBe("postposition");
        break;
      }
    }
    expect(repaired).toBe(true);
  });

  it("U1: VSO + postposition can repair to preposition over many trials", () => {
    const lang = makeLang({ wordOrder: "VSO", caseStrategy: "postposition" });
    let repaired = false;
    for (let i = 0; i < 200; i++) {
      const r = enforceTypologicalUniversals(lang, makeRng(`u1b-${i}`));
      if (r.length > 0) {
        repaired = true;
        expect(r[0]!.to).toBe("preposition");
        break;
      }
    }
    expect(repaired).toBe(true);
  });

  it("U2: SOV + post-adjective can repair to pre-adjective", () => {
    const lang = makeLang({ wordOrder: "SOV", adjectivePosition: "post" });
    let repaired = false;
    for (let i = 0; i < 200; i++) {
      const r = enforceTypologicalUniversals(lang, makeRng(`u2-${i}`));
      if (r.some((x) => x.feature === "adjectivePosition")) {
        repaired = true;
        break;
      }
    }
    expect(repaired).toBe(true);
  });

  it("does not touch already-consistent SVO + preposition", () => {
    const lang = makeLang({ wordOrder: "SVO", caseStrategy: "preposition" });
    for (let i = 0; i < 50; i++) {
      const r = enforceTypologicalUniversals(lang, makeRng(`ok-${i}`));
      expect(r.filter((x) => x.feature === "caseStrategy")).toEqual([]);
    }
  });

  it("does not touch already-consistent SOV + postposition + pre-adj + pre-num", () => {
    const lang = makeLang({
      wordOrder: "SOV",
      caseStrategy: "postposition",
      adjectivePosition: "pre",
      numeralPosition: "pre",
    });
    for (let i = 0; i < 50; i++) {
      const r = enforceTypologicalUniversals(lang, makeRng(`ok-sov-${i}`));
      expect(r).toEqual([]);
    }
  });
});
