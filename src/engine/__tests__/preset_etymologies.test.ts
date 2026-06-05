import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { presetPIE } from "../presets/pie";
import { presetGermanic } from "../presets/germanic";
import { presetRomance } from "../presets/romance";
import { presetBantu } from "../presets/bantu";
import { presetTokipona } from "../presets/tokipona";
import { wordMorphemes } from "../semantics/languageMorphemes";
import { lexHas } from "../lexicon/access";
import type { Language, SimulationConfig } from "../types";

/**
 * Track C C-final: every preset is morphemized — its `seedEtymologies` entries resolve through
 * `wordMorphemes` against the built language. This catches the silent-drop failure mode (an entry
 * whose word or a part isn't a seeded lexicon key is dropped at init), and confirms each preset was
 * enriched. The mechanism is determinism-neutral (lang.etymology is engine-inert; see
 * seed_etymologies.test.ts + meaning_layer_baseline.test.ts).
 */
const PRESETS: ReadonlyArray<readonly [string, () => SimulationConfig]> = [
  ["english", presetEnglish],
  ["pie", presetPIE],
  ["germanic", presetGermanic],
  ["romance", presetRomance],
  ["bantu", presetBantu],
  ["tokipona", presetTokipona],
];

function rootLang(cfg: SimulationConfig): Language {
  const s = createSimulation(cfg).getState();
  return s.tree[s.rootId]!.language;
}

describe("preset etymologies — every seedEtymologies entry resolves (no silent drops)", () => {
  for (const [name, build] of PRESETS) {
    const cfg = build();
    const etym = cfg.seedEtymologies ?? {};
    const lang = rootLang(cfg);

    it(`${name}: is enriched and every entry resolves through wordMorphemes`, () => {
      const entries = Object.entries(etym);
      expect(entries.length, `${name} has no seedEtymologies`).toBeGreaterThan(0);
      for (const [word, def] of entries) {
        expect(lexHas(lang, word), `${name}: "${word}" is not a seeded lexicon key`).toBe(true);
        for (const p of def.parts) {
          expect(lexHas(lang, p), `${name}: part "${p}" of "${word}" is not a seeded key`).toBe(true);
        }
        const wm = wordMorphemes(lang, word);
        expect(wm, `${name}: wordMorphemes("${word}") is null`).not.toBeNull();
        // When no real compound/derivation owns the word, the etymology parts are what surface.
        if (!lang.compounds?.[word]) {
          expect(wm!.map((m) => m.id)).toEqual(def.parts);
        }
      }
    });
  }
});

describe("preset etymologies — spot checks of authored ancestry", () => {
  it("english window = wind + eye", () => {
    expect(wordMorphemes(rootLang(presetEnglish()), "window")!.map((m) => m.id)).toEqual(["wind", "eye"]);
  });
  it("germanic woman = wife + man", () => {
    expect(wordMorphemes(rootLang(presetGermanic()), "woman")!.map((m) => m.id)).toEqual(["wife", "man"]);
  });
  it("bantu man = child + husband", () => {
    expect(wordMorphemes(rootLang(presetBantu()), "man")!.map((m) => m.id)).toEqual(["child", "husband"]);
  });
  it("tokipona friend = child + good (jan pona)", () => {
    expect(wordMorphemes(rootLang(presetTokipona()), "friend")!.map((m) => m.id)).toEqual(["child", "good"]);
  });
});
