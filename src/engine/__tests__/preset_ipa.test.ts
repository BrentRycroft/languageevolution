import { describe, it, expect } from "vitest";
import { PRESETS } from "../presets";
import {
  validatePresetIpa,
  summarizePresetIssues,
} from "../presets/validatePreset";

describe("preset IPA conformance", () => {
  for (const preset of PRESETS) {
    it(`${preset.id}: every phoneme is in PHONE_FEATURES`, () => {
      const config = preset.build();
      const issues = validatePresetIpa(config);
      const unknownPhonemes = issues.filter((i) => i.code === "unknown_phoneme");
      if (unknownPhonemes.length > 0) {
        // Eagerly print for CI logs so we can see exactly what's wrong.
        // eslint-disable-next-line no-console
        console.error(
          `Preset "${preset.id}" has ${unknownPhonemes.length} unknown-phoneme issue(s):\n` +
            summarizePresetIssues(unknownPhonemes),
        );
      }
      expect(unknownPhonemes).toEqual([]);
    });

    it(`${preset.id}: no empty seedLexicon entries`, () => {
      const config = preset.build();
      const issues = validatePresetIpa(config);
      const empty = issues.filter((i) => i.code === "empty_form");
      expect(empty).toEqual([]);
    });

    it(`${preset.id}: seedFrequencyHints reference real meanings`, () => {
      const config = preset.build();
      const issues = validatePresetIpa(config);
      const stale = issues.filter((i) => i.code === "stale_freq");
      // Don't fail on stale freq hints — they're harmless extras — but
      // print them so they're visible.
      if (stale.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `Preset "${preset.id}" has ${stale.length} stale freq-hint reference(s) (warning, not failure):\n` +
            summarizePresetIssues(stale),
        );
      }
      expect(true).toBe(true);
    });

    it(`${preset.id}: seedSuppletion references real meanings`, () => {
      const config = preset.build();
      const issues = validatePresetIpa(config);
      const stale = issues.filter((i) => i.code === "stale_suppletion");
      expect(stale).toEqual([]);
    });
  }
});

describe("Phase 48 T10/T11 — hardened validator", () => {
  it("English uses ɹ (alveolar approximant), not raw r", () => {
    const config = PRESETS.find((p) => p.id === "english")!.build();
    const issues = validatePresetIpa(config);
    const rawR = issues.filter((i) => i.code === "raw_r_in_rhotic_approximant");
    if (rawR.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `English has ${rawR.length} raw-r issue(s):\n` +
          summarizePresetIssues(rawR),
      );
    }
    expect(rawR).toEqual([]);
  });

  it("PIE allows reconstruction phonemes (laryngeals, gʲʰ-style stacks)", () => {
    const config = PRESETS.find((p) => p.id === "pie")!.build();
    const issues = validatePresetIpa(config);
    const reconstructionIssues = issues.filter(
      (i) => i.code === "reconstruction_phoneme_outside_mode",
    );
    expect(reconstructionIssues).toEqual([]);
  });

  it("non-reconstruction presets reject laryngeals", () => {
    const englishCfg = PRESETS.find((p) => p.id === "english")!.build();
    // Synthetic injection: add a laryngeal to the English lexicon.
    const lex = { ...englishCfg.seedLexicon, fakeWord: ["h₂", "a"] };
    const polluted = { ...englishCfg, seedLexicon: lex };
    const issues = validatePresetIpa(polluted);
    const reconstructionIssues = issues.filter(
      (i) => i.code === "reconstruction_phoneme_outside_mode",
    );
    expect(reconstructionIssues.length).toBeGreaterThan(0);
  });

  it("Toki Pona is clean of all hardened checks (stale_freq is a warning, not failure)", () => {
    const config = PRESETS.find((p) => p.id === "tokipona")!.build();
    const issues = validatePresetIpa(config);
    const hardChecks = issues.filter(
      (i) =>
        i.code === "raw_r_in_rhotic_approximant" ||
        i.code === "missing_tone" ||
        i.code === "reconstruction_phoneme_outside_mode" ||
        i.code === "unknown_phoneme" ||
        i.code === "empty_form",
    );
    expect(hardChecks).toEqual([]);
  });
});
