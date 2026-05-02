import { describe, it, expect } from "vitest";
import {
  recordColexification,
  recordOneSidedColexification,
} from "../semantics/colexification";
import type { Language } from "../types";

function makeLang(overrides: Partial<Language> = {}): Language {
  return {
    id: "L-co",
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

describe("colexification helpers", () => {
  it("recordColexification adds bidirectional edges", () => {
    const lang = makeLang();
    recordColexification(lang, "tree", "wood");
    expect(lang.colexifiedAs?.tree).toEqual(["wood"]);
    expect(lang.colexifiedAs?.wood).toEqual(["tree"]);
  });

  it("recordColexification is idempotent (no duplicate edges)", () => {
    const lang = makeLang();
    recordColexification(lang, "tree", "wood");
    recordColexification(lang, "tree", "wood");
    recordColexification(lang, "wood", "tree");
    expect(lang.colexifiedAs?.tree).toEqual(["wood"]);
    expect(lang.colexifiedAs?.wood).toEqual(["tree"]);
  });

  it("recordColexification ignores self-edges", () => {
    const lang = makeLang();
    recordColexification(lang, "tree", "tree");
    expect(lang.colexifiedAs).toBeUndefined();
  });

  it("recordOneSidedColexification only credits the winner", () => {
    const lang = makeLang();
    recordOneSidedColexification(lang, "tree", "wood");
    expect(lang.colexifiedAs?.tree).toEqual(["wood"]);
    expect(lang.colexifiedAs?.wood).toBeUndefined();
  });

  it("recordOneSidedColexification accumulates losers under one winner", () => {
    const lang = makeLang();
    recordOneSidedColexification(lang, "tree", "wood");
    recordOneSidedColexification(lang, "tree", "branch");
    expect(lang.colexifiedAs?.tree).toEqual(["wood", "branch"]);
  });

  it("recordOneSidedColexification ignores self-edges", () => {
    const lang = makeLang();
    recordOneSidedColexification(lang, "tree", "tree");
    expect(lang.colexifiedAs).toBeUndefined();
  });
});
