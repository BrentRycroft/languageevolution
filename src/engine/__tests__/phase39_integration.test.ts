import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { presetEnglish } from "../presets/english";
import { presetRomance } from "../presets/romance";
import { createSimulation } from "../simulation";
import { addSynonym } from "../lexicon/mutate";
import { syncWordsFromLexicon } from "../lexicon/word";
import { formatNumeral } from "../translator/numerals";
import type { Language } from "../types";

/**
 * Phase 39h: cross-system integration tests. Verify that the wiring
 * additions in 39a-39o land end-to-end — typing through the
 * translator, the right mechanism activates, the right output emerges.
 */

function freshEnglish(): Language {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 39h — cross-system integration", () => {
  it("compound resolution: typing a compound recomposes from parts", () => {
    const lang = freshEnglish();
    // English seed includes 'stranger' as a compound of strange + -er.agt.
    const result = translateSentence(lang, "stranger");
    expect(result.targetTokens.length).toBeGreaterThan(0);
    // The resolved form should be non-empty (recomposed from parts).
    const found = result.targetTokens.find((t) => t.englishLemma === "stranger");
    expect(found).toBeDefined();
    if (!found) return;
    expect(found.targetForm.length).toBeGreaterThan(0);
  });

  it("synonym selection: meaning with synonyms picks one form via pickSynonym", () => {
    const lang = freshEnglish();
    if (!lang.words) syncWordsFromLexicon(lang, 0);
    // Add a synthetic synonym for 'house'.
    const altForm = ["a", "b", "o", "d", "e"];
    const ok = addSynonym(lang, "house", altForm, { bornGeneration: 0 });
    expect(ok).toBe(true);
    // Translate "house"; the resolver should still find some form (either
    // primary or synonym).
    const result = translateSentence(lang, "the house");
    const found = result.targetTokens.find((t) => t.englishLemma === "house");
    expect(found).toBeDefined();
    if (!found) return;
    expect(found.targetForm.length).toBeGreaterThan(0);
  });

  it("phonemeTarget is set on a fresh language from preset", () => {
    const lang = freshEnglish();
    expect(typeof lang.phonemeTarget).toBe("number");
    expect(lang.phonemeTarget).toBe(44); // English preset declares 44.
  });

  it("numeral formatting: English 'fifty-five' decimal big-small", () => {
    const lang = freshEnglish();
    const tokens = formatNumeral(55, lang);
    expect(tokens).toEqual([
      { lemma: "fifty" },
      { lemma: "five" },
    ]);
  });

  it("numeral formatting: same number under German-style numeralOrder", () => {
    const lang = freshEnglish();
    lang.grammar.numeralOrder = "small-big";
    const tokens = formatNumeral(55, lang);
    expect(tokens[0]!.lemma).toBe("five");
    expect(tokens[0]!.connector).toBe("and");
    expect(tokens[1]!.lemma).toBe("fifty");
  });

  it("articlePresence prefix-merged renders article fused with noun", () => {
    const lang = freshEnglish();
    lang.grammar.articlePresence = "prefix-merged";
    const result = translateSentence(lang, "the dog");
    // Look for the 'dog' token; its targetForm should have the article
    // prefixed (no separate determiner token before it).
    const dogTok = result.targetTokens.find((t) => t.englishLemma === "dog");
    expect(dogTok).toBeDefined();
    if (!dogTok) return;
    expect(dogTok.targetForm.length).toBeGreaterThan(0);
    // Determiner token should NOT be emitted as a separate token.
    const detTok = result.targetTokens.find((t) => t.englishTag === "DET");
    expect(detTok).toBeUndefined();
  });

  it("Romance preset uses β instead of v after Phase 39e", () => {
    const sim = createSimulation(presetRomance());
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    // 'wind' was ["v","e","n","t","u"] pre-39e; should now use β.
    const wind = root.lexicon["wind"];
    expect(wind).toBeDefined();
    if (!wind) return;
    expect(wind).toContain("β");
    expect(wind).not.toContain("v");
  });
});
