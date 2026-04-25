import { describe, expect, it } from "vitest";
import { VOWELS, CONSONANTS, isVowel, isConsonant, isSyllabic, asciiToIpa } from "../phonology/ipa";
import { CATALOG } from "../phonology/catalog";
import { PRESETS } from "../presets";
import { makeRng } from "../rng";

/**
 * Guard rails for IPA compliance. The engine is designed to run on
 * IPA phonemes throughout; this suite catches regressions where
 * ASCII stand-ins leak into the canonical sets, the catalog, or the
 * preset seed lexicons.
 *
 * The canonical phoneme vocabulary is whatever `VOWELS ∪ CONSONANTS`
 * accepts, plus suprasegmental-suffixed variants (length `ː`, tone
 * marks, acute/grave/macron on vowels). Anything else is a leak.
 */

const TONE_MARKS = ["˥˩", "˧˥", "˥", "˧", "˩"];
function isCanonical(p: string): boolean {
  if (p.length === 0) return false;
  if (VOWELS.has(p) || CONSONANTS.has(p)) return true;
  // Strip tone suffix + length mark and retry.
  let base = p;
  for (const t of TONE_MARKS) if (base.endsWith(t)) base = base.slice(0, -t.length);
  if (base.endsWith("ː")) base = base.slice(0, -1);
  return VOWELS.has(base) || CONSONANTS.has(base);
}

describe("IPA compliance", () => {
  describe("canonical vowel set", () => {
    it("includes the umlaut/harmony output vowels", () => {
      // Previously `æ ʏ ɑ` were produced by catalog rules but missing
      // from VOWELS, which broke `isVowel`. Regression guard.
      expect(isVowel("æ")).toBe(true);
      expect(isVowel("ʏ")).toBe(true);
      expect(isVowel("ɑ")).toBe(true);
      expect(isVowel("ɒ")).toBe(true);
      expect(isVowel("ɪ")).toBe(true);
      expect(isVowel("ʊ")).toBe(true);
    });
    it("recognises length-marked variants", () => {
      expect(isVowel("aː")).toBe(true);
      expect(isVowel("iː")).toBe(true);
    });
    it("recognises tone-marked variants", () => {
      expect(isVowel("a˥")).toBe(true);
      expect(isVowel("e˩")).toBe(true);
    });
  });

  describe("canonical consonant set", () => {
    it("uses IPA superscript-j for palatalised stops, not ASCII digraphs", () => {
      // Regression: `kj gj tj dj` should NOT be in the canonical
      // set; they were ASCII stand-ins duplicating `kʲ gʲ tʲ dʲ`.
      expect(isConsonant("kʲ")).toBe(true);
      expect(isConsonant("gʲ")).toBe(true);
      expect(isConsonant("tʲ")).toBe(true);
      expect(isConsonant("dʲ")).toBe(true);
      expect(isConsonant("kj")).toBe(false);
      expect(isConsonant("gj")).toBe(false);
      expect(isConsonant("tj")).toBe(false);
      expect(isConsonant("dj")).toBe(false);
    });
    it("preserves ASCII input via asciiToIpa", () => {
      // User-typed `kj` should still round-trip to `kʲ`.
      expect(asciiToIpa("kj")).toBe("kʲ");
      expect(asciiToIpa("gj")).toBe("gʲ");
      expect(asciiToIpa("tj")).toBe("tʲ");
      expect(asciiToIpa("dj")).toBe("dʲ");
    });
    it("includes glottalic stops + ejectives", () => {
      expect(isConsonant("ʔp")).toBe(true);
      expect(isConsonant("pʼ")).toBe(true);
      expect(isConsonant("tʼ")).toBe(true);
      expect(isConsonant("kʼ")).toBe(true);
    });
    it("includes aspirated + labiovelars", () => {
      expect(isConsonant("pʰ")).toBe(true);
      expect(isConsonant("bʰ")).toBe(true);
      expect(isConsonant("kʷ")).toBe(true);
      expect(isConsonant("gʷʰ")).toBe(true);
    });
  });

  describe("syllabic resonants", () => {
    it("recognises both IPA (U+0329) and Indo-Europeanist (U+0325) forms", () => {
      expect(isSyllabic("m̩")).toBe(true);
      expect(isSyllabic("m̥")).toBe(true);
      expect(isSyllabic("r̩")).toBe(true);
      expect(isSyllabic("r̥")).toBe(true);
    });
  });

  describe("preset seed lexicons", () => {
    it.each(PRESETS.map((p) => p.id))("%s uses only canonical phonemes", (presetId) => {
      const config = PRESETS.find((p) => p.id === presetId)!.build();
      const offenders: Array<{ meaning: string; phoneme: string }> = [];
      for (const [meaning, form] of Object.entries(config.seedLexicon)) {
        for (const p of form) {
          if (!isCanonical(p)) offenders.push({ meaning, phoneme: p });
        }
      }
      if (offenders.length > 0) {
        const sample = offenders
          .slice(0, 5)
          .map((o) => `${o.meaning}: ${JSON.stringify(o.phoneme)}`)
          .join("; ");
        throw new Error(
          `${presetId}: ${offenders.length} non-canonical phoneme${offenders.length === 1 ? "" : "s"} — ${sample}`,
        );
      }
    });
  });

  describe("sound-change catalog", () => {
    it("has well-formed rule ids", () => {
      for (const rule of CATALOG) {
        // family.id — allow upper/lower alphanumerics and underscores
        // in the suffix (e.g. `lenition.k_to_h_before_V`).
        expect(rule.id).toMatch(/^[a-z_]+\.[A-Za-z0-9_]+$/);
        expect(rule.category).toBeDefined();
      }
    });
    it("every rule output (where observable via apply on a probe) stays canonical", () => {
      // Probe each rule with a handful of seed inputs and assert that
      // any phoneme in the output is canonical. Not all rules can be
      // probed through their apply() without specific contexts; we
      // only check that the output phonemes don't drop off the IPA
      // vocabulary (i.e. no rule produces a literal "kj" or similar).
      const probes = [
        ["p", "a", "t", "i"],
        ["k", "ɛ", "m", "u"],
        ["t", "ʃ", "a"],
        ["b", "aː", "n"],
        ["kʷ", "o", "s"],
      ];
      const leaks = new Set<string>();
      const rng = makeRng("ipa-probe");
      for (const rule of CATALOG) {
        for (const probe of probes) {
          try {
            const out = rule.apply(probe.slice(), rng);
            for (const p of out) {
              if (!isCanonical(p)) leaks.add(`${rule.id}: ${JSON.stringify(p)}`);
            }
          } catch {
            // Rules may throw on ill-formed input; ignore — we're
            // probing opportunistically.
          }
        }
      }
      if (leaks.size > 0) {
        throw new Error(`non-canonical output leak: ${[...leaks].join(", ")}`);
      }
    });
  });
});
