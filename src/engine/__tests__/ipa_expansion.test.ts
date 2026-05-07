import { describe, it, expect } from "vitest";
import { featuresOf, findConsonant, findVowel, PHONE_FEATURES } from "../phonology/features";
import { CONSONANTS, VOWELS } from "../phonology/ipa";

/**
 * Phase 48 T5-T7: IPA inventory expansion tests.
 *
 * Verifies that the previously-missing IPA-2020 phonemes now have
 * proper feature bundles, are recognised by the master CONSONANTS /
 * VOWELS sets, and round-trip through `featuresOf`.
 */

describe("Phase 48 T5 — feature schema extensions", () => {
  it("ConsonantFeatures supports implosive/breathy/creaky flags", () => {
    const f = PHONE_FEATURES["ɓ"]!;
    expect(f.type).toBe("consonant");
    if (f.type === "consonant") {
      expect(f.implosive).toBe(true);
    }
  });

  it("VowelFeatures supports centralized/advanced/retracted flags", () => {
    const f = PHONE_FEATURES["ä"]!;
    expect(f.type).toBe("vowel");
    if (f.type === "vowel") {
      expect(f.centralized).toBe(true);
    }
  });

  it("Manner type accepts lateral-fricative + lateral-approximant", () => {
    const f = PHONE_FEATURES["ɬ"]!;
    expect(f.type).toBe("consonant");
    if (f.type === "consonant") {
      expect(f.manner).toBe("lateral-fricative");
    }
    const f2 = PHONE_FEATURES["ʎ"]!;
    if (f2.type === "consonant") {
      expect(f2.manner).toBe("lateral-approximant");
    }
  });
});

describe("Phase 48 T6 — missing pulmonic phonemes", () => {
  const NEW_PULMONIC = [
    "c", "ɟ", "ɢ", "ɱ", "ɴ", "ʙ", "ⱱ", "ɽ",
    "ɸ", "ç", "ʝ", "χ", "ʁ", "ʕ", "ɦ", "ɬ", "ɮ",
    "ʋ", "ɻ", "ɰ", "ɭ", "ʎ", "ʟ",
  ];

  for (const p of NEW_PULMONIC) {
    it(`featuresOf("${p}") returns a defined consonant bundle`, () => {
      const f = featuresOf(p);
      expect(f).toBeDefined();
      expect(f!.type).toBe("consonant");
    });

    it(`CONSONANTS set contains "${p}"`, () => {
      expect(CONSONANTS.has(p)).toBe(true);
    });
  }

  it("ɬ + ɮ are lateral-fricatives", () => {
    const f1 = featuresOf("ɬ")!;
    const f2 = featuresOf("ɮ")!;
    if (f1.type === "consonant") expect(f1.manner).toBe("lateral-fricative");
    if (f2.type === "consonant") {
      expect(f2.manner).toBe("lateral-fricative");
      expect(f2.voice).toBe(true);
    }
  });

  it("c is a voiceless palatal stop", () => {
    const f = featuresOf("c")!;
    if (f.type === "consonant") {
      expect(f.place).toBe("palatal");
      expect(f.manner).toBe("stop");
      expect(f.voice).toBe(false);
    }
  });
});

describe("Phase 48 T7 — implosives + missing vowels", () => {
  const IMPLOSIVES = ["ɓ", "ɗ", "ʄ", "ɠ", "ʛ"];

  for (const p of IMPLOSIVES) {
    it(`featuresOf("${p}") returns implosive: true`, () => {
      const f = featuresOf(p)!;
      if (f.type === "consonant") {
        expect(f.implosive).toBe(true);
        expect(f.voice).toBe(true);
      }
    });
  }

  const MISSING_VOWELS = ["ɘ", "ɵ", "ɤ", "ɞ", "ɜ", "ɐ", "ɶ", "ä"];

  for (const v of MISSING_VOWELS) {
    it(`featuresOf("${v}") returns a defined vowel bundle`, () => {
      const f = featuresOf(v);
      expect(f).toBeDefined();
      expect(f!.type).toBe("vowel");
    });

    it(`VOWELS set contains "${v}"`, () => {
      expect(VOWELS.has(v)).toBe(true);
    });
  }

  it("findConsonant feature-search recovers ɓ via implosive: true", () => {
    const found = findConsonant({
      type: "consonant",
      place: "labial",
      manner: "stop",
      voice: true,
      implosive: true,
    });
    expect(found).toBe("ɓ");
  });

  it("ɤ is mid-high back unrounded (Mandarin-style)", () => {
    const f = featuresOf("ɤ")!;
    if (f.type === "vowel") {
      expect(f.height).toBe("mid-high");
      expect(f.backness).toBe("back");
      expect(f.round).toBe(false);
    }
  });

  it("findVowel feature-search recovers ɤ via height/backness/round", () => {
    // findVowel must not be confused by the new vowels and must still
    // return a valid IPA vowel for the canonical mid-high back unrounded.
    const found = findVowel({
      type: "vowel",
      height: "mid-high",
      backness: "back",
      round: false,
    });
    // Could match either ɤ or any other vowel filling that cell; any
    // mid-high back unrounded is acceptable.
    expect(found).toBeDefined();
    const f = featuresOf(found!)!;
    if (f.type === "vowel") {
      expect(f.height).toBe("mid-high");
      expect(f.backness).toBe("back");
      expect(f.round).toBe(false);
    }
  });
});
