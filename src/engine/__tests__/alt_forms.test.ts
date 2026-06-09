import { describe, it, expect } from "vitest";
import type { LexemeStore } from "../types";
import {
  addAlt,
  pruneAlts,
  promoteAltOnPrimaryLoss,
  allFormsFor,
} from "../lexicon/altForms";
import { makeRng } from "../rng";
import type { Language } from "../types";
import { rekeyLexiconToLexemeIds } from "../lexicon/lexemeIdentity";
import { tForm as lexGet, tDelete as lexDelete } from "../lexicon/__tests__/glossSeam";

/**
 * alt_forms.test.ts
 *
 * Test suite for: "altForms".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function makeLang(overrides: Partial<Language> = {}): Language {
  const lang: Language = {
    id: "L",
    name: "Test",
    lexemes: {},
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
  rekeyLexiconToLexemeIds(lang);
  return lang;
}

describe("altForms", () => {
  it("addAlt appends a new alternate with register tag", () => {
    const lang = makeLang({ lexemes: { horse: ["h", "ɔ", "r", "s"] } as unknown as LexemeStore });
    expect(addAlt(lang, "horse", ["s", "t", "iː", "d"], "high")).toBe(true);
    expect(lang.altForms?.horse).toEqual([["s", "t", "iː", "d"]]);
    expect(lang.altRegister?.horse).toEqual(["high"]);
  });

  it("addAlt skips a duplicate that equals the primary form", () => {
    const lang = makeLang({ lexemes: { horse: ["h", "ɔ", "r", "s"] } as unknown as LexemeStore });
    expect(addAlt(lang, "horse", ["h", "ɔ", "r", "s"])).toBe(false);
    expect(lang.altForms?.horse).toBeUndefined();
  });

  it("addAlt skips a duplicate already in altForms", () => {
    const lang = makeLang({ lexemes: { horse: ["h", "ɔ", "r", "s"] } as unknown as LexemeStore });
    addAlt(lang, "horse", ["s", "t", "iː", "d"], "high");
    expect(addAlt(lang, "horse", ["s", "t", "iː", "d"], "high")).toBe(false);
    expect(lang.altForms?.horse).toHaveLength(1);
  });

  it("addAlt caps the alt list at 4 entries (drops the oldest)", () => {
    const lang = makeLang({ lexemes: { x: ["a"] } as unknown as LexemeStore });
    addAlt(lang, "x", ["b"]);
    addAlt(lang, "x", ["c"]);
    addAlt(lang, "x", ["d"]);
    addAlt(lang, "x", ["e"]);
    addAlt(lang, "x", ["f"]); // should evict "b"
    expect(lang.altForms?.x).toEqual([["c"], ["d"], ["e"], ["f"]]);
  });

  it("pruneAlts removes the last alt when its meaning's frequency is low", () => {
    const lang = makeLang({
      lexemes: { x: ["a"] } as unknown as LexemeStore,
      wordFrequencyHints: { x: 0.1 } as Record<string, number>, // low — high decay
    });
    addAlt(lang, "x", ["b"], "low");
    pruneAlts(lang, 1.0, makeRng("prune-1")); // chance(1) → always fires
    expect(lang.altForms?.x).toBeUndefined();
  });

  it("pruneAlts protects high-frequency meanings", () => {
    const lang = makeLang({
      lexemes: { x: ["a"] } as unknown as LexemeStore,
      wordFrequencyHints: { x: 0.95 } as Record<string, number>, // high — low decay
    });
    addAlt(lang, "x", ["b"], "low");
    // Run 20 times with chance(0.05); should usually keep at least one
    let removed = 0;
    for (let i = 0; i < 20; i++) {
      pruneAlts(lang, 0.05, makeRng(`p-${i}`));
      if (!lang.altForms?.x) {
        removed++;
        addAlt(lang, "x", ["b"], "low");
      }
    }
    // Effective decay = 0.05 * (1 - 0.95) = 0.0025; over 20 trials ~0.05 expected
    expect(removed).toBeLessThan(5);
  });

  it("promoteAltOnPrimaryLoss promotes the first alt to primary", () => {
    const lang = makeLang({ lexemes: { x: ["a"] } as unknown as LexemeStore });
    addAlt(lang, "x", ["b"], "high");
    addAlt(lang, "x", ["c"], "low");
    lexDelete(lang, "x");
    const promoted = promoteAltOnPrimaryLoss(lang, "x");
    expect(promoted).toEqual(["b"]);
    expect(lexGet(lang, "x")).toEqual(["b"]);
    expect(lang.altForms?.x).toEqual([["c"]]);
    expect(lang.altRegister?.x).toEqual(["low"]);
  });

  it("promoteAltOnPrimaryLoss returns null when no alts available", () => {
    const lang = makeLang();
    expect(promoteAltOnPrimaryLoss(lang, "x")).toBeNull();
  });

  it("allFormsFor returns primary first, then alternates", () => {
    const lang = makeLang({ lexemes: { x: ["a"] } as unknown as LexemeStore });
    addAlt(lang, "x", ["b"]);
    addAlt(lang, "x", ["c"]);
    const all = allFormsFor(lang, "x");
    expect(all).toEqual([["a"], ["b"], ["c"]]);
  });

  it("allFormsFor returns just primary when no alts", () => {
    const lang = makeLang({ lexemes: { x: ["a"] } as unknown as LexemeStore });
    expect(allFormsFor(lang, "x")).toEqual([["a"]]);
  });

  it("allFormsFor returns empty when meaning is missing entirely", () => {
    const lang = makeLang();
    expect(allFormsFor(lang, "x")).toEqual([]);
  });
});
