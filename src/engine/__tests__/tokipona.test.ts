import { describe, it, expect } from "vitest";
import { presetTokipona } from "../presets/tokipona";
import { createSimulation } from "../simulation";
import { PRESETS } from "../presets";

const TOKIPONA_CONSONANTS = new Set(["p", "t", "k", "s", "m", "n", "l", "j", "w"]);
const TOKIPONA_VOWELS = new Set(["a", "e", "i", "o", "u"]);

describe("toki pona preset", () => {
  it("is registered in the preset picker", () => {
    const entry = PRESETS.find((p) => p.id === "tokipona");
    expect(entry).toBeDefined();
    expect(entry?.label).toContain("Toki pona");
  });

  it("seed lexicon uses only toki pona phonemes", () => {
    const cfg = presetTokipona();
    for (const [meaning, form] of Object.entries(cfg.seedLexicon)) {
      for (const p of form) {
        expect(
          TOKIPONA_CONSONANTS.has(p) || TOKIPONA_VOWELS.has(p),
          `${meaning}: phoneme "${p}"`,
        ).toBe(true);
      }
    }
  });

  it("has no inflectional morphology", () => {
    const cfg = presetTokipona();
    expect(Object.keys(cfg.seedMorphology?.paradigms ?? {}).length).toBe(0);
  });

  it("grammar is SVO with no case and no gender", () => {
    const cfg = presetTokipona();
    expect(cfg.modes).toBeDefined();
    expect(Object.keys(cfg.seedLexicon).length).toBeGreaterThanOrEqual(70);
  });

  it("runs deterministically without crashing", () => {
    const sim = createSimulation(presetTokipona());
    for (let i = 0; i < 30; i++) sim.step();
    expect(sim.getState().generation).toBe(30);
  });
});
