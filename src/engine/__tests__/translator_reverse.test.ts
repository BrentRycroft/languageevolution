import { describe, it, expect } from "vitest";
import {
  buildReverseIndex,
  reverseParseToTokens,
} from "../translator/sentence";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";

function englishLang() {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("translator reverse direction", () => {
  it("buildReverseIndex maps form strings to meanings", () => {
    const lang = englishLang();
    const index = buildReverseIndex(lang);
    // English's "cat" is /kæt/.
    const catIpa = lang.lexicon.cat!.join("");
    expect(index.get(catIpa)).toBe("cat");
  });

  it("buildReverseIndex includes a lowercased fallback", () => {
    const lang = englishLang();
    const index = buildReverseIndex(lang);
    // Most English IPA is already lowercase, but a few use uppercase
    // diacritics. Spot check via lookup case.
    const watIpa = lang.lexicon.water!.join("");
    expect(index.get(watIpa.toLowerCase())).toBe("water");
  });

  it("reverseParseToTokens splits whitespace and resolves each token", () => {
    const lang = englishLang();
    const dog = lang.lexicon.dog!.join("");
    const cat = lang.lexicon.cat!.join("");
    const tokens = reverseParseToTokens(lang, `${dog} ${cat}`);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.englishLemma).toBe("dog");
    expect(tokens[1]?.englishLemma).toBe("cat");
  });

  it("reverseParseToTokens marks unmatched tokens as fallback", () => {
    const lang = englishLang();
    const tokens = reverseParseToTokens(lang, "xqzqz");
    expect(tokens[0]?.resolution).toBe("fallback");
    expect(tokens[0]?.englishLemma).toBe("?");
  });

  it("reverseParseToTokens handles empty input", () => {
    const lang = englishLang();
    expect(reverseParseToTokens(lang, "")).toEqual([]);
    expect(reverseParseToTokens(lang, "   ")).toEqual([]);
  });

  it("buildReverseIndex includes altForms when present", () => {
    const lang = englishLang();
    if (!lang.altForms) lang.altForms = {};
    if (!lang.altForms.horse) lang.altForms.horse = [];
    lang.altForms.horse.push(["s", "t", "iː", "d"]);
    const index = buildReverseIndex(lang);
    expect(index.get("stiːd")).toBe("horse");
  });
});
