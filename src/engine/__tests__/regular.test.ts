import { describe, it, expect } from "vitest";
import { applyOneRegularChange } from "../phonology/regular";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import type { Language } from "../types";
import { lexSet, lexKeys, lexGet } from "../lexicon/access";

/**
 * regular.test.ts
 *
 * Test suite for: "regular (Neogrammarian) sound change".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function makeLang(): Language {
  const lang: Language = {
    id: "L-0",
    name: "Proto",
    lexicon: {},
    enabledChangeIds: ["lenition.p_to_f"],
    changeWeights: { "lenition.p_to_f": 1 },
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    orthography: {}, otRanking: [], lastChangeGeneration: {},
  };
  lexSet(lang, "pit", ["p", "i", "t"]);
  lexSet(lang, "pip", ["p", "i", "p"]);
  lexSet(lang, "pop", ["p", "o", "p"]);
  return lang;
}

describe("regular (Neogrammarian) sound change", () => {
  it("applies p → f to every matching site in every word", () => {
    const lang = makeLang();
    const rng = makeRng("regular");
    const rule = CATALOG_BY_ID["lenition.p_to_f"]!;
    applyOneRegularChange(lang, [rule], rng);
    for (const m of lexKeys(lang)) {
      for (const p of lexGet(lang, m)!) {
        expect(p).not.toBe("p");
      }
    }
  });

  it("returns null when no rule has any matching site", () => {
    const lang = makeLang();
    lang.lexicon = {}; lang.conceptIds = {};
    lexSet(lang, "foo", ["f", "o", "o"]);
    const rng = makeRng("empty");
    const rule = CATALOG_BY_ID["lenition.p_to_f"]!;
    expect(applyOneRegularChange(lang, [rule], rng)).toBeNull();
  });
});
