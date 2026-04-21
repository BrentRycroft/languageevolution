import { describe, it, expect } from "vitest";
import { GENESIS_BY_ID } from "../genesis/catalog";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import type { Language } from "../types";

function makeLang(): Language {
  return {
    id: "L-0",
    name: "Proto",
    lexicon: {
      foot: ["p", "o", "d"],
      ball: ["b", "a", "l"],
      water: ["w", "a", "t", "e", "r"],
    },
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
  };
}

describe("word genesis", () => {
  it("compounding produces a form that is the concatenation of two forms", () => {
    const rng = makeRng("compound-test");
    const rule = GENESIS_BY_ID["genesis.compound"]!;
    const result = rule.tryCoin(makeLang(), rng);
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
    const base = lang.lexicon[baseMeaning]!;
    expect(result.form.slice(-base.length)).toEqual(base);
  });
});
