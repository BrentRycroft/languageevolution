import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { coinKeylessLexeme } from "../lexicon/lexemeIdentity";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { satSet } from "../lexicon/satellites";
import { isGrammaticalizationSource } from "../morphology/evolve";
import type { Language } from "../types";

function rootLang(): Language {
  const s = createSimulation(presetEnglish()).getState();
  return s.tree[s.rootId]!.language;
}

/**
 * keyless_widen_grammaticalization.test.ts — S2b task 5.
 * Grammaticalization is concept-coupled, so keyless words are maturity-gated: a fresh keyless word
 * (freq 0.4) is not a grammaticalization source; once its frequency climbs past KEYLESS_MATURITY_FREQ
 * (0.5) and it is open-class with a semantic tag + short form, it becomes eligible.
 */
describe("S2b task 5 — grammaticalization gated by keyless maturity", () => {
  it("a FRESH keyless word (freq 0.4) is NOT a grammaticalization source", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("walk")), ["w", "o", "k", "o"]);
    expect(isGrammaticalizationSource(lang, kid)).toBe(false); // immature
  });

  it("a MATURE keyless open-class word with a tag IS a grammaticalization source", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("walk")), ["w", "o", "k", "o"]);
    satSet(lang, "wordFrequencyHints", kid, 0.8);
    expect(isGrammaticalizationSource(lang, kid)).toBe(true);
  });
});
