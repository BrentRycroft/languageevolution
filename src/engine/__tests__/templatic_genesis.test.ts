import { describe, it, expect } from "vitest";
import { MECHANISM_TEMPLATE } from "../genesis/mechanisms/template";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { makeRng } from "../rng";

/**
 * templatic_genesis.test.ts
 *
 * Test suite for: "Phase 55 T1 — templatic (root + pattern) genesis mechanism".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("Phase 55 T1 — templatic (root + pattern) genesis mechanism", () => {
  it("returns null when the language has no rootInventory", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const rng = makeRng("template-test");
    const result = MECHANISM_TEMPLATE.tryCoin(lang, "write", {}, rng);
    expect(result).toBeNull();
  });

  it("interleaves root consonants into a CV pattern when both fields are populated", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    // Inject a synthetic templatic profile.
    lang.rootInventory = {
      "write": ["k", "t", "b"],
      "study": ["d", "ɹ", "s"],
    };
    lang.rootPatterns = ["CaCiC", "CaCCaC"];
    const rng = makeRng("template-positive");
    const result = MECHANISM_TEMPLATE.tryCoin(lang, "write", {}, rng);
    expect(result).not.toBeNull();
    // Form should contain root consonants interleaved with vowels.
    const form = result!.form;
    expect(form.length).toBeGreaterThanOrEqual(4);
    expect(result!.sources?.partMeanings).toBeDefined();
    expect(result!.sources!.partMeanings![0]).toBe("write");
  });

  it("non-templatic presets keep producing null from the template mechanism", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const rng = makeRng("template-noop");
    expect(MECHANISM_TEMPLATE.tryCoin(lang, "anything", {}, rng)).toBeNull();
  });
});
