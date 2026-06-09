import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { wordMorphemes } from "../semantics/languageMorphemes";
import { tForm as lexGet, tGlosses as lexKeys } from "../lexicon/__tests__/glossSeam";
import type { Language, SimulationConfig } from "../types";

/**
 * Track C plan 0b: `seedEtymologies` records a previously-atomic word's morphological ancestry in
 * the engine-INERT `lang.etymology` field — read only by the Dictionary / Track B composition
 * accessors, never by any simulation subsystem. So it must be DETERMINISM-NEUTRAL (no form/output
 * change over a run), while still surfacing through `wordMorphemes`. (Recording it on `lang.compounds`
 * instead would NOT be neutral: a word's "has recorded parts" status changes derivation / taboo /
 * obsolescence / neighbour-bootstrap behaviour and shifts the RNG stream.)
 */
function rootLang(cfg: SimulationConfig): Language {
  const s = createSimulation(cfg).getState();
  return s.tree[s.rootId]!.language;
}

function lexDigest(lang: Language): string {
  return lexKeys(lang)
    .slice()
    .sort()
    .map((k) => `${k}:${(lexGet(lang, k) ?? []).join("")}`)
    .join("|");
}

function runDigest(cfg: SimulationConfig, gens: number): string {
  const sim = createSimulation(cfg);
  for (let i = 0; i < gens; i++) sim.step();
  const s = sim.getState();
  return lexDigest(s.tree[s.rootId]!.language);
}

// Determinism probe only — parts are existing seedLexicon lexemes (etymology correctness is the
// agents' job; here we only prove neutrality + wiring).
const ETYM = { mountain: { parts: ["big", "stone"] } };

describe("seedEtymologies — determinism-neutral structure recording", () => {
  it("records the decomposition through wordMorphemes without changing the form", () => {
    const lang = rootLang({ ...presetEnglish(), seedEtymologies: ETYM });
    const parts = wordMorphemes(lang, "mountain");
    expect(parts).not.toBeNull();
    expect(parts!.map((m) => m.id)).toEqual(["big", "stone"]);
    // form is PRESERVED (not recomposed to big+stone)
    expect(lexGet(lang, "mountain")).toEqual(presetEnglish().seedLexicon!["mountain"]);
  });

  it("does not change simulation output over 15 generations (determinism firewall)", () => {
    const withEtym = { ...presetEnglish(), seedEtymologies: ETYM };
    expect(runDigest(withEtym, 15)).toEqual(runDigest(presetEnglish(), 15));
  });

  it("does not clobber an existing derivation (behind stays be- + hind)", () => {
    const lang = rootLang({ ...presetEnglish(), seedEtymologies: { behind: { parts: ["big", "stone"] } } });
    expect(wordMorphemes(lang, "behind")!.map((m) => m.id)).toEqual(["be-", "hind"]);
  });
});
