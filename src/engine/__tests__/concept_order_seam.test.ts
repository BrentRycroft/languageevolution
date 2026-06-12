import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { presetGermanic } from "../presets/germanic";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { orderedLexemeIds } from "../lexicon/lexemeIdentity";
import type { SimulationConfig } from "../types";

/**
 * S5 — ORDER-CONTRACT lock. The canonical RNG-draw order that the hot path (apply.ts, naming.ts,
 * reverse.ts) walks is `orderedLexemeIds` = the store keys sorted lexicographically by intrinsic
 * LexemeId — gloss-INDEPENDENT (the S5 flip). This freezes that contract so a regression to
 * gloss-sorting (or any other order) is caught here, not as a silent trajectory divergence in the
 * slow harness.
 */
const PRESETS: Record<string, () => SimulationConfig> = {
  pie: presetPIE,
  bantu: presetBantu,
  romance: presetRomance,
  germanic: presetGermanic,
  tokipona: presetTokipona,
  english: presetEnglish,
};

describe("concept-order seam — canonical order is sorted LexemeIds", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it(`${name}: canonical order (orderedLexemeIds) is the store keys sorted by LexemeId`, () => {
      const lang = createSimulation(build()).getState().tree["L-0"]!.language;
      expect(orderedLexemeIds(lang.lexemes)).toEqual(Object.keys(lang.lexemes).sort());
    });
  }
});
