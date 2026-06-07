import { describe, it, expect } from "vitest";
import type { LexemeStore } from "../types";
import { deleteMeaning } from "../lexicon/mutate";
import { lexGet, lexSet } from "../lexicon/access";
import { rekeyLexiconToLexemeIds } from "../lexicon/lexemeIdentity";
import { satGet } from "../lexicon/satellites";
import type { Language, Phoneme } from "../types";

/**
 * delete_meaning_metadata.test.ts
 *
 * Test suite for: "Phase 68a T1 — deleteMeaning purges Phase 64/66 metadata".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function fakeLang(): Language {
  const m = "king";
  const lang = {
    lexemes: { [m]: ["k", "i", "ŋ"] as Phoneme[] } as unknown as LexemeStore,
    wordFrequencyHints: { [m]: 0.9 } as Record<string, number>,
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
  rekeyLexiconToLexemeIds(lang);
  // S2a: the flipped satellite maps (wordFrequencyHints, wordOrigin) are
  // LexemeId-keyed in production, so re-key their gloss-seeded entries to the
  // minted id — otherwise the id-keyed registry purge can't find them.
  const _id = lang.lexemeIds![m]!;
  for (const _f of ["wordFrequencyHints", "wordOrigin"] as const) {
    const _map = lang[_f] as Record<string, unknown>;
    if (_map && _id !== m && _map[m] !== undefined) {
      _map[_id] = _map[m]!;
      delete _map[m];
    }
  }
  return lang;
}

describe("Phase 68a T1 — deleteMeaning purges Phase 64/66 metadata", () => {
  it("removes meaning from all per-meaning maps including new ones", () => {
    const lang = fakeLang();
    deleteMeaning(lang, "king");

    expect(lexGet(lang, "king")).toBeUndefined();
    expect((lang.wordFrequencyHints as Record<string, number>)["king"]).toBeUndefined();
    expect(satGet(lang, "wordOrigin", "king")).toBeUndefined();
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
    lexSet(lang, "wolf", ["w", "ʊ", "l", "f"] as Phoneme[]);
    lang.nounDeclensionClass!["wolf"] = 2;
    deleteMeaning(lang, "king");
    expect(lexGet(lang, "wolf")).toBeDefined();
    expect(lang.nounDeclensionClass?.["wolf"]).toBe(2);
  });
});
