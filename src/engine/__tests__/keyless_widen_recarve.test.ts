import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { coinKeylessLexeme } from "../lexicon/lexemeIdentity";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { satSet } from "../lexicon/satellites";
import { effectiveGlossFor } from "../lexicon/evolvable";
import { isRegisteredConcept } from "../lexicon/concepts";
import { recarveMergeCandidateIds } from "../semantics/recarve";
import type { Language } from "../types";

function rootLang(): Language {
  const s = createSimulation(presetEnglish()).getState();
  return s.tree[s.rootId]!.language;
}

/**
 * keyless_widen_recarve.test.ts — S2b task 7.
 * Recarve (split/merge) + colexification are concept-coupled, so keyless words are maturity-gated: a
 * fresh keyless word (freq 0.4) is excluded from recarve candidates; once mature (freq ≥ 0.5) and its
 * emergent gloss is a registered concept, it is a first-class candidate addressed by its LexemeId.
 */
describe("S2b task 7 — recarve gated by keyless maturity", () => {
  it("a FRESH keyless word (freq 0.4) is excluded from recarve merge candidates", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("hand")), ["h", "a", "n", "d", "o"]);
    expect(recarveMergeCandidateIds(lang).includes(kid)).toBe(false);
  });

  it("a MATURE keyless word whose emergent gloss is a registered concept is a merge candidate", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("hand")), ["h", "a", "n", "d", "o"]);
    satSet(lang, "wordFrequencyHints", kid, 0.9);
    expect(isRegisteredConcept(effectiveGlossFor(lang, kid))).toBe(true); // precondition
    expect(recarveMergeCandidateIds(lang).includes(kid)).toBe(true);
  });
});
