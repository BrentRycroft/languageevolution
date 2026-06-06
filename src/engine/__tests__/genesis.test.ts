import { describe, it, expect } from "vitest";
import { GENESIS_BY_ID } from "../genesis/catalog";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { rekeyLexiconToLexemeIds } from "../lexicon/lexemeIdentity";
import { lexGet } from "../lexicon/access";
import type { Language } from "../types";

/**
 * genesis.test.ts
 *
 * Test suite for: "word genesis".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function makeLang(lexicon: Record<string, string[]> = {
  foot: ["p", "o", "d"],
  hand: ["h", "a", "n", "d"],
  head: ["h", "e", "d"],
}): Language {
  const lang = {
    id: "L-0",
    name: "Proto",
    // Phase 2c (evolution-realism): genesis.compound requires a SEMANTICALLY-
    // RELATED pair. The default body words suffice for the non-compound tests;
    // the compound test passes its own geometrically-coherent lexicon (see below)
    // because the vector-native flip's geometric clusterOf scatters body parts.
    lexicon: { ...lexicon },
    enabledChangeIds: [],
    changeWeights: {},
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
  } as unknown as Language;
  rekeyLexiconToLexemeIds(lang);
  return lang;
}

describe("word genesis", () => {
  it("compounding produces a form that is the concatenation of two forms", () => {
    // Vector-native flip: genesis.compound builds from SEMANTICALLY-RELATED parts, and relatedness is
    // now GEOMETRIC (clusterOf/neighborsOf read GloVe). Body parts (the old foot/hand/head lexicon)
    // scatter across geometric fields, so use a geometrically-coherent water lexicon whose members are
    // genuine GloVe neighbours/cluster-mates → the mechanism coins e.g. lake-rain.
    const rng = makeRng("c-water-0");
    const rule = GENESIS_BY_ID["genesis.compound"]!;
    const result = rule.tryCoin(
      makeLang({
        water: ["w", "a", "t", "e", "r"], river: ["r", "i", "v", "e", "r"], sea: ["s", "e"],
        lake: ["l", "a", "k"], rain: ["r", "a", "n"], stream: ["s", "t", "r", "i", "m"],
      }),
      rng,
    );
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.meaning).toContain("-");
    expect(result.form.length).toBeGreaterThan(1);
  });

  it("derivation appends a known suffix", () => {
    const rng = makeRng("deriv-test");
    const rule = GENESIS_BY_ID["genesis.derivation"]!;
    const result = rule.tryCoin(makeLang(), rng);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.meaning).toMatch(/-(er|ness|ic|al|ine)$/);
  });

  it("reduplication includes the original form at the end", () => {
    const rng = makeRng("redup-test");
    const rule = GENESIS_BY_ID["genesis.reduplication"]!;
    const lang = makeLang();
    const result = rule.tryCoin(lang, rng);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.meaning).toMatch(/-intens$/);
    const baseMeaning = result.meaning.replace(/-intens$/, "");
    const base = lexGet(lang, baseMeaning)!;
    expect(result.form.slice(-base.length)).toEqual(base);
  });
});
