import { describe, it, expect } from "vitest";
import { deleteMeaning } from "../lexicon/mutate";
import type { Language, Phoneme } from "../types";

function fakeLang(): Language {
  const m = "king";
  return {
    lexicon: { [m]: ["k", "i", "ŋ"] as Phoneme[] },
    wordFrequencyHints: { [m]: 0.9 },
    lastChangeGeneration: { [m]: 5 },
    wordOrigin: { [m]: "preset-seed" },
    localNeighbors: { [m]: [] },
    inflectionClass: { [m]: 2 },
    nounDeclensionClass: { [m]: 3 },
    ablautClassAssignment: { [m]: 1 },
    grammaticalizationStage: {
      [m]: { stage: 2, targetCategory: "verb.tense.past", lastTransitionGen: 10 },
    },
    words: [],
  } as unknown as Language;
}

describe("Phase 68a T1 — deleteMeaning purges Phase 64/66 metadata", () => {
  it("removes meaning from all per-meaning maps including new ones", () => {
    const lang = fakeLang();
    deleteMeaning(lang, "king");

    expect(lang.lexicon["king"]).toBeUndefined();
    expect(lang.wordFrequencyHints["king"]).toBeUndefined();
    expect(lang.wordOrigin["king"]).toBeUndefined();
    expect(lang.localNeighbors["king"]).toBeUndefined();

    // Phase 68a T1: these were leaking pre-fix.
    expect(lang.inflectionClass?.["king"]).toBeUndefined();
    expect(lang.nounDeclensionClass?.["king"]).toBeUndefined();
    expect(lang.ablautClassAssignment?.["king"]).toBeUndefined();
    expect(lang.grammaticalizationStage?.["king"]).toBeUndefined();
  });

  it("idempotent on a meaning that's already gone", () => {
    const lang = fakeLang();
    deleteMeaning(lang, "king");
    expect(() => deleteMeaning(lang, "king")).not.toThrow();
  });

  it("doesn't affect other meanings", () => {
    const lang = fakeLang();
    lang.lexicon["wolf"] = ["w", "ʊ", "l", "f"] as Phoneme[];
    lang.nounDeclensionClass!["wolf"] = 2;
    deleteMeaning(lang, "king");
    expect(lang.lexicon["wolf"]).toBeDefined();
    expect(lang.nounDeclensionClass?.["wolf"]).toBe(2);
  });
});
