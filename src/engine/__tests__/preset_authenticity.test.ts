import { describe, it, expect } from "vitest";
import { PRESETS } from "../presets";
import { presetPIE } from "../presets/pie";
import { presetGermanic } from "../presets/germanic";
import { presetRomance } from "../presets/romance";
import { presetBantu } from "../presets/bantu";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { validatePresetIpa } from "../presets/validatePreset";
import type { SimulationConfig } from "../types";

/**
 * Authored-only invariant (replaces the Lane E ≥1000-word floor). Every catalog
 * preset must load EXACTLY its bare `presetX()` seed lexicon — no synthetic
 * `generateForm` padding — and the random `default` preset must be gone. This
 * locks the "no made-up words" guarantee.
 */
const BARE: Record<string, () => SimulationConfig> = {
  pie: presetPIE,
  germanic: presetGermanic,
  romance: presetRomance,
  bantu: presetBantu,
  tokipona: presetTokipona,
  english: presetEnglish,
};

describe("preset authenticity — catalog presets are authored-only", () => {
  it("the catalog no longer contains the random 'default' preset", () => {
    expect(PRESETS.find((p) => p.id === "default")).toBeUndefined();
  });

  it("every catalog preset maps to a known authentic builder", () => {
    for (const p of PRESETS) {
      expect(BARE[p.id], `no bare builder registered for catalog preset "${p.id}"`).toBeDefined();
    }
  });

  for (const p of PRESETS) {
    it(`${p.id}: build().seedLexicon equals its bare builder (no enrichment layer)`, () => {
      const built = p.build().seedLexicon ?? {};
      const bare = BARE[p.id]!().seedLexicon ?? {};
      expect(Object.keys(built).sort()).toEqual(Object.keys(bare).sort());
      for (const k of Object.keys(bare)) expect(built[k]).toEqual(bare[k]);
    });

    it(`${p.id}: no blocking IPA issues`, () => {
      const blocking = validatePresetIpa(p.build()).filter(
        (i) => i.code === "unknown_phoneme" || i.code === "empty_form",
      );
      expect(blocking).toEqual([]);
    });
  }
});
