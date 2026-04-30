import { describe, it, expect } from "vitest";
import { applyPhonologyToAffixes, maybeGrammaticalize, maybeMergeParadigms, inflect } from "../morphology/evolve";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import type { Language } from "../types";

function makeLang(): Language {
  return {
    id: "L-0",
    name: "Proto",
    lexicon: {
      go: ["g", "a", "n"],
      come: ["k", "o", "m"],
    },
    enabledChangeIds: ["lenition.p_to_f"],
    changeWeights: { "lenition.p_to_f": 1 },
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: { go: 0.9, come: 0.9 },
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: {
      paradigms: {
        "verb.tense.past": {
          affix: ["p", "e", "d"],
          position: "suffix",
          category: "verb.tense.past",
        },
      },
    },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    orthography: {}, otRanking: [], lastChangeGeneration: {},
  };
}

describe("morphology evolution", () => {
  it("applyPhonologyToAffixes mutates each paradigm's affix through the given transform", () => {
    const lang = makeLang();
    const rule = CATALOG_BY_ID["lenition.p_to_f"]!;
    const rng = makeRng("morph");
    applyPhonologyToAffixes(lang.morphology, (form) => {
      if (rule.probabilityFor(form) <= 0) return form;
      return rule.apply(form, rng);
    });
    const affix = lang.morphology.paradigms["verb.tense.past"]!.affix;
    expect(affix[0]).toBe("f");
  });

  it("grammaticalization replaces a high-frequency short word with an affix", () => {
    const lang = makeLang();
    const rng = makeRng("gram");
    const shift = maybeGrammaticalize(lang, rng, 1);
    expect(shift).not.toBeNull();
    const remaining = Object.keys(lang.lexicon).length;
    expect(remaining).toBeLessThan(2);
    const categories = Object.keys(lang.morphology.paradigms);
    expect(categories.length).toBeGreaterThan(1);
  });

  it("paradigm merge collapses identical affixes in same position", () => {
    const lang = makeLang();
    lang.morphology.paradigms["verb.tense.fut"] = {
      affix: ["p", "e", "d"],
      position: "suffix",
      category: "verb.tense.fut",
    };
    const rng = makeRng("merge");
    const shift = maybeMergeParadigms(lang, rng, 1);
    expect(shift).not.toBeNull();
    expect(Object.keys(lang.morphology.paradigms).length).toBe(1);
  });

  it("inflect appends suffixes and prepends prefixes correctly", () => {
    const paradigm = {
      affix: ["e", "d"],
      position: "suffix" as const,
      category: "verb.tense.past" as const,
    };
    expect(inflect(["w", "a", "l", "k"], paradigm)).toEqual(["w", "a", "l", "k", "e", "d"]);
    const prefixParadigm = {
      affix: ["a"],
      position: "prefix" as const,
      category: "verb.tense.past" as const,
    };
    expect(inflect(["s", "e", "e"], prefixParadigm)).toEqual(["a", "s", "e", "e"]);
  });
});
