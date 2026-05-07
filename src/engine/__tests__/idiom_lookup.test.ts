import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { lookupIdiom, lookupForm } from "../lexicon/lookup";

describe("Phase 55 T2 — idiom + multi-word lookup", () => {
  it("returns null when the language has no idioms", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    expect(lookupIdiom(lang, ["kick", "the", "bucket"])).toBeNull();
  });

  it("returns null on single-token input", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    lang.idioms = {
      "kick the bucket": {
        parts: ["kick", "the", "bucket"],
        form: ["d", "a", "j"],
      },
    };
    expect(lookupIdiom(lang, ["die"])).toBeNull();
  });

  it("returns the idiom's form when the phrase matches exactly", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    lang.idioms = {
      "kick the bucket": {
        parts: ["kick", "the", "bucket"],
        form: ["d", "a", "j"],
      },
    };
    const result = lookupIdiom(lang, ["kick", "the", "bucket"]);
    expect(result).toEqual(["d", "a", "j"]);
  });

  it("idiom lookup is case-insensitive", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    lang.idioms = {
      "kick the bucket": {
        parts: ["kick", "the", "bucket"],
        form: ["d", "a", "j"],
      },
    };
    const result = lookupIdiom(lang, ["Kick", "THE", "Bucket"]);
    expect(result).toEqual(["d", "a", "j"]);
  });

  it("absent idiom returns null (caller composes per-word)", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    lang.idioms = {};
    expect(lookupIdiom(lang, ["pick", "up"])).toBeNull();
    // Per-word lookup still works for these meanings via lookupForm.
    expect(lookupForm(lang, "pick")).toBeDefined();
  });
});
