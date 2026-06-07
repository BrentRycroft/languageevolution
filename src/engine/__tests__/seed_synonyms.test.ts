import { describe, it, expect } from "vitest";
import { lexGet } from "../lexicon/access";
import { buildInitialState } from "../steps/init";
import { presetPIE } from "../presets/pie";
import { presetEnglish } from "../presets/english";

/**
 * MEGA overhaul: preset-declared SYNONYMS / lexical doublets (the inverse of
 * colexification — one meaning carrying several competing forms). Seeded via
 * `config.seedAltForms` and materialised onto `lang.altForms` at language birth.
 */
describe("seedAltForms — preset synonym doublets", () => {
  it("PIE seeds the *akʷ- doublet for water alongside *wódr̥", () => {
    const lang = buildInitialState(presetPIE()).tree["L-0"]!.language;
    expect(lang.altForms?.water?.length).toBeGreaterThan(0);
    // primary form is still the seedLexicon *wódr̥, the alternate is the aqua root
    expect(lang.altForms!.water).toContainEqual(["a", "kʷ"]);
  });

  it("English seeds make / create / craft / build as competing forms", () => {
    const lang = buildInitialState(presetEnglish()).tree["L-0"]!.language;
    expect(lang.altForms?.make?.length).toBe(3);
  });

  it("alt forms are only attached to meanings the language actually has", () => {
    const lang = buildInitialState(presetEnglish()).tree["L-0"]!.language;
    for (const meaning of Object.keys(lang.altForms ?? {})) {
      // every meaning carrying doublets must itself be a real lexicon entry
      expect(lexGet(lang, meaning) ?? lang.words?.some((w) => w.senses.some((s) => s.meaning === meaning))).toBeTruthy();
    }
  });
});
