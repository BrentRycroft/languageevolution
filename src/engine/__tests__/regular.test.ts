import { describe, it, expect } from "vitest";
import { applyOneRegularChange } from "../phonology/regular";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import type { Language } from "../types";

function makeLang(): Language {
  return {
    id: "L-0",
    name: "Proto",
    lexicon: {
      pit: ["p", "i", "t"],
      pip: ["p", "i", "p"],
      pop: ["p", "o", "p"],
    },
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
    customRules: [],
    orthography: {}, otRanking: [], lastChangeGeneration: {},
  };
}

describe("regular (Neogrammarian) sound change", () => {
  it("applies p → f to every matching site in every word", () => {
    const lang = makeLang();
    const rng = makeRng("regular");
    const rule = CATALOG_BY_ID["lenition.p_to_f"]!;
    applyOneRegularChange(lang, [rule], rng);
    // Every p should now be f in every word.
    for (const m of Object.keys(lang.lexicon)) {
      for (const p of lang.lexicon[m]!) {
        expect(p).not.toBe("p");
      }
    }
  });

  it("returns null when no rule has any matching site", () => {
    const lang = makeLang();
    lang.lexicon = { foo: ["f", "o", "o"] };
    const rng = makeRng("empty");
    const rule = CATALOG_BY_ID["lenition.p_to_f"]!;
    expect(applyOneRegularChange(lang, [rule], rng)).toBeNull();
  });
});
