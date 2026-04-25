import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { presetPIE } from "../presets/pie";
import { createSimulation } from "../simulation";

function preset(p: typeof presetPIE) {
  const sim = createSimulation(p());
  sim.step();
  return sim.getState().tree["L-0"]!.language;
}

describe("copula handling — language-agnostic", () => {
  it("'X is Y' parses even without an open-class V token", () => {
    const lang = preset(presetPIE);
    const out = translateSentence(lang, "the man is here");
    // We expect at least subject + complement to surface; the copula
    // also surfaces because PIE has *h₁es-.
    const surfaces = out.targetTokens.map((t) => t.targetSurface).filter(Boolean);
    expect(surfaces.length).toBeGreaterThanOrEqual(2);
  });

  it("'X is not' surfaces both subject AND negation (was bug: only subject)", () => {
    const lang = preset(presetPIE);
    const out = translateSentence(lang, "the man is not");
    const englishLemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(englishLemmas).toContain("man");
    expect(englishLemmas).toContain("not");
  });

  it("'He is not' surfaces 'he' AND negation", () => {
    const lang = preset(presetPIE);
    const out = translateSentence(lang, "he is not");
    const englishLemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(englishLemmas).toContain("he");
    expect(englishLemmas).toContain("not");
  });

  it("languages with a 'be' lexeme surface the copula verb", () => {
    const lang = preset(presetPIE);
    const out = translateSentence(lang, "the man is here");
    const englishLemmas = out.targetTokens.map((t) => t.englishLemma);
    // PIE has *h₁es- → "be" should surface as a verb token.
    expect(englishLemmas).toContain("be");
  });

  it("zero-copula languages drop the copula but keep subject + complement + negation", () => {
    const lang = preset(presetPIE);
    // Manufacture zero-copula by removing 'be' from the lexicon.
    delete lang.lexicon["be"];
    const out = translateSentence(lang, "the man is not here");
    const englishLemmas = out.targetTokens.map((t) => t.englishLemma);
    // Subject + locative should still surface; the copula is dropped.
    expect(englishLemmas).toContain("man");
    expect(englishLemmas).toContain("here");
    expect(englishLemmas).toContain("not");
    expect(englishLemmas).not.toContain("be");
  });

  it("'did not' (no main verb) still surfaces negation in the legacy path", () => {
    const lang = preset(presetPIE);
    const out = translateSentence(lang, "the man did not");
    const englishLemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(englishLemmas).toContain("not");
    expect(englishLemmas).toContain("man");
  });
});

describe("copula evolution — erosion + genesis", () => {
  it("a copula-having language can lose its copula over time", async () => {
    const { stepCopulaErosion } = await import("../steps/copula");
    const { makeRng } = await import("../rng");
    const lang = preset(presetPIE);
    expect(lang.lexicon["be"]).toBeDefined();
    // Force loss with p=1 so the test is deterministic.
    const cfg = { obsolescence: { copulaLossProbability: 1 } } as never;
    stepCopulaErosion(lang, cfg, makeRng("erosion"), 1);
    expect(lang.lexicon["be"]).toBeUndefined();
  });

  it("a zero-copula language can grammaticalise a new copula from a demonstrative", async () => {
    const { stepCopulaGenesis } = await import("../steps/copula");
    const { makeRng } = await import("../rng");
    const lang = preset(presetPIE);
    delete lang.lexicon["be"];
    // Force genesis with p=1.
    const cfg = { obsolescence: { copulaGenesisProbability: 1 } } as never;
    stepCopulaGenesis(lang, cfg, makeRng("genesis"), 1);
    expect(lang.lexicon["be"]).toBeDefined();
    // The new `be` should mirror the donor's form (PIE has 'this'
    // → so/to-flavoured demonstratives, picked first by pathway
    // ordering).
    expect(lang.lexicon["be"]!.length).toBeGreaterThan(0);
    // wordOrigin should record the pathway.
    expect(lang.wordOrigin["be"]).toMatch(/^grammaticalization:/);
  });

  it("genesis preserves the donor word's original meaning (polysemy)", async () => {
    const { stepCopulaGenesis } = await import("../steps/copula");
    const { makeRng } = await import("../rng");
    const lang = preset(presetPIE);
    delete lang.lexicon["be"];
    const thisFormBefore = lang.lexicon["this"]?.slice();
    const cfg = { obsolescence: { copulaGenesisProbability: 1 } } as never;
    stepCopulaGenesis(lang, cfg, makeRng("polysemy"), 1);
    // Donor word still has its original meaning.
    expect(lang.lexicon["this"]).toEqual(thisFormBefore);
  });

  it("erosion is a no-op when there's no copula to lose", async () => {
    const { stepCopulaErosion } = await import("../steps/copula");
    const { makeRng } = await import("../rng");
    const lang = preset(presetPIE);
    delete lang.lexicon["be"];
    const cfg = { obsolescence: { copulaLossProbability: 1 } } as never;
    stepCopulaErosion(lang, cfg, makeRng("noop"), 1);
    expect(lang.lexicon["be"]).toBeUndefined();
  });

  it("genesis is a no-op when the language already has a copula", async () => {
    const { stepCopulaGenesis } = await import("../steps/copula");
    const { makeRng } = await import("../rng");
    const lang = preset(presetPIE);
    const original = lang.lexicon["be"]!.slice();
    const cfg = { obsolescence: { copulaGenesisProbability: 1 } } as never;
    stepCopulaGenesis(lang, cfg, makeRng("noop2"), 1);
    expect(lang.lexicon["be"]).toEqual(original);
  });
});
