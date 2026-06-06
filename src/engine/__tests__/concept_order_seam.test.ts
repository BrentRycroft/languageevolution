import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { presetGermanic } from "../presets/germanic";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { orderedLexiconKeys, orderedLexemeIds, meaningForLexemeId } from "../lexicon/conceptIdentity";
import { lexKeys } from "../lexicon/access";
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
    it(`${name}: orderedLexiconKeys is the sorted gloss sequence`, () => {
      const lang = createSimulation(build()).getState().tree["L-0"]!.language;
      // Post-flip the store is LexemeId-keyed; the canonical order is the
      // GLOSSES sorted (resolved from the store keys).
      expect(orderedLexiconKeys(lang)).toEqual(lexKeys(lang).sort());
      // orderedLexemeIds returns the SAME glosses' store keys in the SAME
      // order, so the RNG hot path draws in the identical per-word sequence.
      const cidGlosses = orderedLexemeIds(lang.lexicon, lang).map(
        (cid) => meaningForLexemeId(lang, cid)!,
      );
      expect(cidGlosses).toEqual(orderedLexiconKeys(lang));
    });
  }
});
