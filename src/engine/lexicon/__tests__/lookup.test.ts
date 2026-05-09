import { describe, it, expect } from "vitest";
import { lookupForm, lookupFormWithResolution } from "../lookup";
import { presetEnglish } from "../../presets/english";
import { createSimulation } from "../../simulation";

/**
 * lookup.test.ts
 *
 * Test suite for: "Phase 52 T1 — lookup abstraction".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("Phase 52 T1 — lookup abstraction", () => {
  it("direct lookup returns the lexicon form unchanged", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const out = lookupFormWithResolution(lang, "water");
    expect(out.form).toEqual(lang.lexicon["water"]);
    expect(out.resolution).toBe("direct");
  });

  it("compositional English lemma routes through synth or graceful fallback", () => {
    // Phase 53.5 tightened validation: only CONCEPTS-grounded lemmas
    // pass. `lighter` decomposes via Phase 49's affix path
    // (light is in CONCEPTS + -er agentive affix recognised) and
    // routes through synth-affix.
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const out = lookupFormWithResolution(lang, "lighter");
    expect(out.form).not.toBeNull();
    expect(["synth-fallback", "synth-affix", "fallback"]).toContain(out.resolution);
  });

  it("gibberish gets the literal-quote fallback (no coinage)", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const out = lookupFormWithResolution(lang, "asdfgh");
    expect(out.form).toBeNull();
    expect(out.resolution).toBe("fallback");
  });

  it("closed-class lemmas (be) don't trigger fallback coinage", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    delete lang.lexicon["be"];
    const out = lookupFormWithResolution(lang, "be");
    // Either pivots to a related form (fallback) or gets the literal
    // quote — never synth-fallback because FALLBACK_SKIP gates it.
    expect(out.resolution).not.toBe("synth-fallback");
  });

  it("lookupForm is the form-only convenience over the same logic", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    expect(lookupForm(lang, "water")).toEqual(lang.lexicon["water"]);
    expect(lookupForm(lang, "asdfgh")).toBeNull();
  });

  it("compound recomposition works through the abstraction", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    if (lang.compounds && Object.keys(lang.compounds).length > 0) {
      const m = Object.keys(lang.compounds)[0]!;
      const meta = lang.compounds[m]!;
      const allPartsHave = meta.parts.every((p) => lang.lexicon[p]);
      if (allPartsHave) {
        delete lang.lexicon[m];
        const out = lookupFormWithResolution(lang, m);
        expect(out.form).not.toBeNull();
        expect(out.glossNote).toContain("compound");
      }
    }
  });
});
