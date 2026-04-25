import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { presetPIE } from "../presets/pie";
import { createSimulation } from "../simulation";

function pieLang() {
  const sim = createSimulation(presetPIE());
  sim.step();
  return sim.getState().tree["L-0"]!.language;
}

describe("translator polish — possessive 's", () => {
  it("'the king's wolf' parses king as possessor and wolf as head", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king's wolf sees the dog");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("king");
    expect(lemmas).toContain("wolf");
    expect(lemmas).toContain("dog");
    // Subject head is wolf, not king (king is the possessor).
    const wolfIdx = lemmas.indexOf("wolf");
    const dogIdx = lemmas.indexOf("dog");
    expect(wolfIdx).toBeLessThan(dogIdx); // wolf comes before object
  });

  it("possessor noun gets noun.case.gen morphology when hasCase + paradigm", () => {
    const lang = pieLang();
    // PIE has gen paradigm; verify the king surface picks it up.
    lang.morphology.paradigms["noun.case.gen"] = {
      affix: ["s"],
      position: "suffix",
      category: "noun.case.gen",
    };
    const out = translateSentence(lang, "the king's wolf");
    const king = out.targetTokens.find((t) => t.englishLemma === "king");
    expect(king?.targetSurface).toMatch(/s$/);
  });

  it("possessive determiners (his/her/their/...) surface via closed-class", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "his wolf sees the dog");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("his");
    expect(lemmas).toContain("wolf");
  });
});

describe("translator polish — contractions n't", () => {
  it("'doesn't see' rewrites to does + NEG + see", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king doesn't see");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("not");
  });

  it("'isn't' rewrites the host to is + NEG", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king isn't here");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("not");
    expect(lemmas).toContain("here");
  });
});

describe("translator polish — coordinated NPs", () => {
  it("'X and Y see Z' surfaces both subjects + the conjunction", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king and the wolf see the dog");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("king");
    expect(lemmas).toContain("wolf");
    expect(lemmas).toContain("and");
  });

  it("'Z sees X and Y' surfaces both objects + the conjunction", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king sees the wolf and the dog");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("king");
    expect(lemmas).toContain("wolf");
    expect(lemmas).toContain("dog");
    expect(lemmas).toContain("and");
  });

  it("'X or Y' uses 'or' as the conjunction", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king or the wolf is here");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("or");
    expect(lemmas).toContain("king");
    expect(lemmas).toContain("wolf");
  });

  it("possessive + coordination compose: 'the king's wolf and the dog see'", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king's wolf and the dog see");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("king");
    expect(lemmas).toContain("wolf");
    expect(lemmas).toContain("dog");
    expect(lemmas).toContain("and");
  });
});
