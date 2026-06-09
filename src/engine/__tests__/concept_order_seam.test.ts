import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { presetGermanic } from "../presets/germanic";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { orderedLexemeIds, meaningForLexemeId } from "../lexicon/lexemeIdentity";
import { tGlosses as lexKeys } from "../lexicon/__tests__/glossSeam";
import type { SimulationConfig } from "../types";

/**
 * B1 (Stage B meaning re-key) — ORDER-CONTRACT lock.
 *
 * `orderedLexiconKeys` is the single canonical lexicon-iteration order that
 * RNG-coupled sites (apply.ts, naming.ts) walk. Stage B's re-key to LexemeId
 * MUST preserve this exact sequence (it's the byte-identity contract — see
 * docs/planning/archive/STAGE-B-PLAN.md §3). Today the contract is "sorted English glosses". This
 * test freezes that so a future change to the helper that breaks the order is
 * caught here, not as a silent trajectory divergence in the slow harness.
 */
const PRESETS: Record<string, () => SimulationConfig> = {
  pie: presetPIE,
  bantu: presetBantu,
  romance: presetRomance,
  germanic: presetGermanic,
  tokipona: presetTokipona,
  english: presetEnglish,
};

describe("concept-order seam — canonical order is sorted glosses", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it(`${name}: canonical order (orderedLexemeIds) is the sorted gloss sequence`, () => {
      const lang = createSimulation(build()).getState().tree["L-0"]!.language;
      // Post-S3 the canonical RNG-draw order is orderedLexemeIds (LexemeId store keys); resolved to
      // glosses it is the GLOSSES sorted — the byte-identity contract the RNG hot path (apply.ts,
      // naming.ts) walks. (Keyless ids, which map to no gloss, are filtered — none exist at GEN0.)
      const cidGlosses = orderedLexemeIds(lang.lexemes, lang)
        .map((cid) => meaningForLexemeId(lang, cid))
        .filter((m): m is string => m !== undefined);
      expect(cidGlosses).toEqual(lexKeys(lang).sort());
    });
  }
});
