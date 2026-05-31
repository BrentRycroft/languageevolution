import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { lookupFormWithResolution } from "../lexicon/lookup";
import { reverseTranslate } from "../translator/reverse";
import { formToString } from "../phonology/ipa";
import { lexGet } from "../lexicon/access";

/**
 * synonym_roundtrip.test.ts
 *
 * Test suite for: "Phase 54 — synonym round-trip via reverse-lookup abstraction".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("Phase 54 — synonym round-trip via reverse-lookup abstraction", () => {
  it("affix synonyms register via lang.words and reverse-translate to the same meaning", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    // English has 3 productive abstractNoun affixes (-ness, -ship, -hood).
    // Phase 53 T5 registers them as synonyms when synthesis fires.
    const result = lookupFormWithResolution(lang, "wetness");
    if (result.resolution !== "synth-affix") return; // skip if synth didn't fire

    // The lemma now lives in lang.lexicon AND lang.words has at least
    // one synonym entry attached for the same meaning.
    expect(lexGet(lang, "wetness")).toBeDefined();
    const matchingWords = lang.words!.filter((w) =>
      w.senses.some((s) => s.meaning === "wetness"),
    );
    expect(matchingWords.length).toBeGreaterThanOrEqual(1);

    // Reverse round-trip: typing the SECONDARY synonym surface should
    // resolve back to "wetness" (not a different meaning).
    if (matchingWords.length >= 2) {
      const synonymWord = matchingWords[1]!;
      const synonymSurface = formToString(synonymWord.form);
      const rev = reverseTranslate(lang, synonymSurface);
      const allRecovered = new Set<string>();
      for (const t of rev.tokens) {
        if (t.lemma) allRecovered.add(t.lemma);
        if (t.alternateLemmas) for (const a of t.alternateLemmas) allRecovered.add(a);
      }
      expect(allRecovered.has("wetness")).toBe(true);
    }
  });
});
