import { describe, it, expect } from "vitest";
import { satGet, satSet, satHas, satDelete, satKeys, satEntries } from "../lexicon/satellites";
import type { Language } from "../types";

// Minimal hand-built lang: one seeded gloss "fire" with an id, one keyless id.
function makeLang(): Language {
  const lang = {
    id: "root",
    lexemeIds: { fire: "c_aaaa_root_1" },
    lexemes: {
      "c_aaaa_root_1": { form: ["f", "i"], point: [0], gloss: "fire" },
      "c_bbbb_root_2": { form: ["k", "o"], point: [1] }, // keyless (no gloss)
    },
    wordFrequencyHints: {} as Record<string, number>,
  } as unknown as Language;
  return lang;
}

describe("satellites seam — gloss/id resolution", () => {
  it("satSet by gloss writes under the gloss's LexemeId; satGet by gloss reads it back", () => {
    const lang = makeLang();
    satSet(lang, "wordFrequencyHints", "fire", 0.9);
    expect((lang.wordFrequencyHints as Record<string, number>)["c_aaaa_root_1"]).toBe(0.9);
    expect(satGet(lang, "wordFrequencyHints", "fire")).toBe(0.9);
  });

  it("satSet/satGet by keyless id round-trips without minting a gloss", () => {
    const lang = makeLang();
    satSet(lang, "wordFrequencyHints", "c_bbbb_root_2", 0.3);
    expect(satGet(lang, "wordFrequencyHints", "c_bbbb_root_2")).toBe(0.3);
    expect(lang.lexemeIds!["c_bbbb_root_2"]).toBeUndefined(); // no spurious gloss entry
  });

  it("satGet for an unknown gloss returns undefined and does not mint", () => {
    const lang = makeLang();
    const before = Object.keys(lang.lexemeIds!).length;
    expect(satGet(lang, "wordFrequencyHints", "water")).toBeUndefined();
    expect(Object.keys(lang.lexemeIds!).length).toBe(before);
  });

  it("satHas / satDelete agree with satGet", () => {
    const lang = makeLang();
    satSet(lang, "wordFrequencyHints", "fire", 0.5);
    expect(satHas(lang, "wordFrequencyHints", "fire")).toBe(true);
    satDelete(lang, "wordFrequencyHints", "fire");
    expect(satHas(lang, "wordFrequencyHints", "fire")).toBe(false);
    expect(satGet(lang, "wordFrequencyHints", "fire")).toBeUndefined();
  });

  it("satKeys yields LexemeIds in insertion order; satEntries pairs id→value", () => {
    const lang = makeLang();
    satSet(lang, "wordFrequencyHints", "fire", 0.5);
    satSet(lang, "wordFrequencyHints", "c_bbbb_root_2", 0.3);
    expect(satKeys(lang, "wordFrequencyHints")).toEqual(["c_aaaa_root_1", "c_bbbb_root_2"]);
    expect(satEntries(lang, "wordFrequencyHints")).toEqual([
      ["c_aaaa_root_1", 0.5],
      ["c_bbbb_root_2", 0.3],
    ]);
  });
});
