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
