import { describe, it, expect } from "vitest";
import { inflect, applyPhonologyToAffixes } from "../morphology/evolve";
import { DEFAULT_MORPHOLOGY } from "../morphology/defaults";
import type { Morphology } from "../morphology/types";

describe("morphology", () => {
  it("inflect appends suffixes correctly", () => {
    const paradigm = DEFAULT_MORPHOLOGY.paradigms["verb.tense.past"];
    expect(paradigm).toBeTruthy();
    const base = ["w", "a", "l", "k"];
    const result = inflect(base, paradigm);
    expect(result).toEqual(["w", "a", "l", "k", "e", "d"]);
  });

  it("applyPhonologyToAffixes mutates every paradigm in place", () => {
    const morph: Morphology = {
      paradigms: {
        "noun.case.acc": { affix: ["m"], position: "suffix", category: "noun.case.acc" },
        "verb.tense.past": { affix: ["e", "d"], position: "suffix", category: "verb.tense.past" },
      },
    };
    applyPhonologyToAffixes(morph, (form) => form.map((p) => (p === "m" ? "n" : p)));
    expect(morph.paradigms["noun.case.acc"]!.affix).toEqual(["n"]);
    expect(morph.paradigms["verb.tense.past"]!.affix).toEqual(["e", "d"]);
  });
});
