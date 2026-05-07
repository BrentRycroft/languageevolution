import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { presetPIE } from "../presets/pie";
import { createSimulation } from "../simulation";

function pieLang() {
  const sim = createSimulation(presetPIE());
  sim.step();
  return sim.getState().tree["L-0"]!.language;
}

describe("translator polish — predicate adjectives", () => {
  it("'X is happy' surfaces the predicate adjective", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king is happy");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("happy");
  });

  it("'today was good' surfaces 'good'", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "today was good");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("good");
  });

  it("'the man was not happy' keeps man + not + happy + (be)", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the man was not happy");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("man");
    expect(lemmas).toContain("not");
    expect(lemmas).toContain("happy");
  });

  it("predicate adjective inherits noun-number agreement when subject is plural", () => {
    const lang = pieLang();
    lang.morphology.paradigms["adj.num.pl"] = {
      affix: ["s"],
      position: "suffix",
      category: "adj.num.pl",
    };
    lang.lexicon["happy"] = ["w", "e", "l"];
    const out = translateSentence(lang, "the kings are happy");
    const adj = out.targetTokens.find((t) => t.englishLemma === "happy");
    expect(adj?.targetSurface).toMatch(/s$/);
  });
});

describe("translator polish — leading discourse coordinators", () => {
  it("'And he was here' surfaces 'and'", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "and he was here");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("and");
    expect(lemmas).toContain("he");
    expect(lemmas).toContain("here");
  });

  it("'But the king sees' surfaces 'but' before subject", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "but the king sees the wolf");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas[0]).toBe("but");
  });
});

describe("translator polish — object pronouns alias to subject lemmas", () => {
  it("'she sees him' resolves him via the 'he' lexeme", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "she sees him");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("he");
    expect(lemmas).toContain("she");
  });

  it("'I see them' resolves them via the 'they' lexeme", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "i see them");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("i");
    expect(lemmas).toContain("they");
  });
});

/**
 * Phase 50 T3: when a lemma can't be resolved by any prior rung, the
 * translator now coins a fresh form for it via `attemptGracefulFallback`
 * and writes it to the lexicon (Rung 8). The previous "surface in
 * quotation marks" behaviour is preserved as a fallback only when even
 * the graceful synthesis fails (e.g., language with no phoneme
 * inventory). These tests now assert that the lemma DOES resolve to a
 * non-quoted surface form on the first translation, and that the
 * resolution is `synth-fallback`.
 */
describe("translator polish — unresolved words coin via graceful fallback", () => {
  it("missing noun coins a fresh form (no quotation marks)", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the dragon eats the king");
    const dragon = out.targetTokens.find((t) => t.englishLemma === "dragon");
    expect(dragon).toBeDefined();
    expect(dragon!.targetSurface).not.toContain("“");
    expect(dragon!.resolution).toBe("synth-fallback");
  });

  it("missing verb coins a fresh form", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the spaceship lands on the moon");
    const land = out.targetTokens.find((t) => t.englishLemma === "land");
    expect(land?.resolution).toBe("synth-fallback");
    expect(land?.targetSurface).not.toContain("“");
  });

  it("missing adjective coins a fresh form", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the wise king sees");
    const wise = out.targetTokens.find((t) => t.englishLemma === "wise");
    expect(wise?.resolution).toBe("synth-fallback");
    expect(wise?.targetSurface).not.toContain("“");
  });

  it("missing predicate adjective coins a fresh form", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king is angry");
    const angry = out.targetTokens.find((t) => t.englishLemma === "angry");
    expect(angry?.resolution).toBe("synth-fallback");
    expect(angry?.targetSurface).not.toContain("“");
  });
});

describe("translator polish — irregular plurals", () => {
  it("'wolves' strips to 'wolf' so it resolves", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king sees the wolves");
    const wolf = out.targetTokens.find((t) => t.englishLemma === "wolf");
    expect(wolf).toBeDefined();
    expect(out.missing).not.toContain("wolve");
    expect(out.missing).not.toContain("wolves");
  });
});
