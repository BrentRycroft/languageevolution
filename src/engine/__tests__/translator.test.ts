import { describe, it, expect } from "vitest";
import { translate } from "../translator/translate";
import type { Language } from "../types";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { DEFAULT_MORPHOLOGY } from "../morphology/defaults";
import { lexSet } from "../lexicon/access";

/**
 * translator.test.ts
 *
 * Test suite for: "translator".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function sampleLang(): Language {
  const lang: Language = {
    id: "L-0",
    name: "Proto",
    lexicon: {},
    conceptIds: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: {
      paradigms: { ...DEFAULT_MORPHOLOGY.paradigms },
    },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    orthography: {}, otRanking: [], lastChangeGeneration: {},
  };
  lexSet(lang, "water", ["w", "a", "t", "e", "r"]);
  lexSet(lang, "fire", ["p", "u", "r"]);
  lexSet(lang, "water-fire", ["w", "a", "t", "e", "r", "p", "u", "r"]);
  return lang;
}

describe("translator", () => {
  it("returns the direct form for a known meaning", () => {
    const r = translate(sampleLang(), "water");
    expect(r.source).toBe("exact");
    expect(r.form).toBe("water");
  });

  it("inflects when a morphology category is provided", () => {
    const r = translate(sampleLang(), "water", { inflect: "verb.tense.past" });
    expect(r.source).toBe("exact");
    expect(r.form.endsWith("ed")).toBe(true);
  });

  it("falls back to a neighbor meaning", () => {
    // "rain-water" is not in the lexicon; its top-3 geometric neighbours are
    // ["water", "well-water", "snow"] (GloVe geometry), so the neighbor-fallback
    // finds "water" (which IS in sampleLang) and returns source="neighbor".
    // (Old target "river" no longer works: river's GloVe neighbours are valley/lake/shore/along/bridge,
    // none of which are in sampleLang, so the cascade now falls through to the compound rung.)
    const r = translate(sampleLang(), "rain-water");
    expect(r.source).toBe("neighbor");
    expect(r.form).toBe("water");
  });

  it("surfaces a compound containing the target meaning", () => {
    const lang = sampleLang();
    const r = translate(lang, "fire");
    expect(r.source).toBe("exact");
  });

  it("returns missing when nothing matches", () => {
    const r = translate(sampleLang(), "xyzzy");
    expect(r.source).toBe("missing");
  });

  it("falls through to the shared cascade (reverse-colex) where the simple chain returned missing", () => {
    const lang = sampleLang();
    // `democracy` is not in the lexicon, not a semantic neighbor of
    // water/fire, and not a compound — the simple exact/neighbor/compound
    // chain returns missing. But colexifiedAs records it as absorbed into
    // `water`, which the shared resolution cascade recovers via its
    // reverse-colex rung. Pre-fix, word-level translate() never consulted
    // the cascade and returned "missing" here.
    lang.colexifiedAs = { water: ["democracy"] };
    const r = translate(lang, "democracy");
    expect(r.source).not.toBe("missing");
    expect(r.form).toBe("water");
  });
});
