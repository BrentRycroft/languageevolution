import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { presetRomance } from "../presets/romance";
import { generateDiscourseNarrative } from "../narrative/discourse_generate";
import { reverseTranslate } from "../translator/reverse";
import { formToString } from "../phonology/ipa";
import { tGlosses as lexKeys, tForm as lexGet } from "../lexicon/__tests__/glossSeam";
import type { SimulationConfig } from "../types";

/**
 * Behaviour-LOCK: derived meaning keys must NOT leak their raw affix
 * scaffolding into narrative glosses/captions.
 *
 * Coined derivations are stored in the lexicon under synthetic keys like
 * `build-tér.agt` / `carrot-prae-.tbef` (base + bound-morpheme key). When such
 * a word is selected for a narrative slot, the composer must render a clean
 * base lemma + Leipzig derivation tag ("build" + AGT), NOT the raw key. The
 * cleaning (composer.ts `stripDerivationAffix`, applied in
 * `projectRoleClauseToTokens`) reads the language's OWN `boundMorphemes` set,
 * so it is language-agnostic. This test freezes that so the leak — observed in
 * a 2026-05-29 play session — cannot silently return.
 */
const PRESETS: Record<string, () => SimulationConfig> = {
  pie: presetPIE,
  romance: presetRomance,
};

// Affix-scaffolding markers: a `.category` tag on a bound-morpheme key, or the
// `--` double hyphen of a naive base+affix concat.
const SCAFFOLD =
  /[.·](agt|tbef|abs|ptcp|adj|inst|cmp|dim|neg|fem|action)\b|--/;

describe("narrative gloss — derived keys never leak affix scaffolding", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it(`${name}: discourse glosses are clean after derivations accumulate`, () => {
      const sim = createSimulation(build());
      for (let i = 0; i < 50; i++) sim.step();
      const lang = sim.getState().tree["L-0"]!.language;

      // Sanity: the run actually produced derived keys, so the test exercises
      // the cleaning path rather than passing vacuously.
      const bound = lang.boundMorphemes ?? new Set<string>();
      const derivedKeys = lexKeys(lang).filter(
        (m) => !bound.has(m) && SCAFFOLD.test(m),
      );
      expect(derivedKeys.length).toBeGreaterThan(0);

      for (const seed of ["myth-a", "myth-b", "legend-c"]) {
        const out = generateDiscourseNarrative(lang, seed, { lines: 8, genre: "myth" });
        for (const line of out) {
          const blob = JSON.stringify(line);
          expect(
            SCAFFOLD.test(blob),
            `affix scaffolding leaked into a gloss line: ${line.gloss ?? blob}`,
          ).toBe(false);
        }
      }
    });
  }
});

describe("translator reverse — derived target words gloss cleanly", () => {
  for (const [name, build] of Object.entries(PRESETS)) {
    it(`${name}: reverseTranslate of a derived form yields a clean gloss`, () => {
      const sim = createSimulation(build());
      for (let i = 0; i < 50; i++) sim.step();
      const lang = sim.getState().tree["L-0"]!.language;
      const bound = lang.boundMorphemes ?? new Set<string>();
      const derived = lexKeys(lang).filter(
        (m) => !bound.has(m) && SCAFFOLD.test(m) && (lexGet(lang, m)?.length ?? 0) > 0,
      );
      expect(derived.length).toBeGreaterThan(0);
      for (const m of derived) {
        const surface = formToString(lexGet(lang, m)!);
        const rev = reverseTranslate(lang, surface);
        expect(
          SCAFFOLD.test(rev.english),
          `reverse caption leaked scaffolding for ${m}: "${rev.english}"`,
        ).toBe(false);
      }
    });
  }
});
