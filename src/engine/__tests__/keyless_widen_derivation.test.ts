import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { coinKeylessLexeme } from "../lexicon/lexemeIdentity";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { satSet } from "../lexicon/satellites";
import { derivationBaseEligible } from "../morphology/derivation";
import type { Language } from "../types";

function rootLang(): Language {
  const s = createSimulation(presetEnglish()).getState();
  return s.tree[s.rootId]!.language;
}

/**
 * keyless_widen_derivation.test.ts — S2b task 6.
 * Derivation is concept-coupled, so keyless words are maturity-gated as derivation bases: a fresh
 * keyless word (freq 0.4) is not an eligible base; once its frequency climbs past KEYLESS_MATURITY_FREQ
 * (0.5) it can be a base (deriving from it yields a normal seeded derived word).
 */
describe("S2b task 6 — derivation gated by keyless maturity", () => {
  it("a mature keyless word is an eligible derivation base; a fresh one is not", () => {
    const lang = rootLang();
    const fresh = coinKeylessLexeme(lang, fromFloats(embed("tree")), ["t", "r", "i", "o"]);
    const mature = coinKeylessLexeme(lang, fromFloats(embed("stone")), ["s", "t", "o", "n", "o"]);
    satSet(lang, "wordFrequencyHints", mature, 0.8);
    expect(derivationBaseEligible(lang, mature)).toBe(true);
    expect(derivationBaseEligible(lang, fresh)).toBe(false); // immature
  });
});
