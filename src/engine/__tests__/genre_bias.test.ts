import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { pickSynonymForGenre } from "../narrative/genre_bias";
import { addWord } from "../lexicon/word";
import { makeRng } from "../rng";

describe("Phase 58 T1 — discourse-genre style biases", () => {
  it("returns null for a meaning with no lexicalised forms", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const rng = makeRng("genre-empty");
    const result = pickSynonymForGenre(lang, "wibblefex-not-real", "poetry", rng);
    expect(result).toBeNull();
  });

  it("returns the only word when meaning has a single form", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const rng = makeRng("genre-single");
    const result = pickSynonymForGenre(lang, "water", "myth", rng);
    expect(result).not.toBeNull();
    expect(result!.word.senses.some((s) => s.meaning === "water")).toBe(true);
  });

  it("with two synonyms (high + low register), poetry leans toward high", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    // Inject a high-register synonym for an existing meaning.
    addWord(lang, ["h", "i", "g", "h"], "water", {
      bornGeneration: 5,
      register: "high",
      synonym: true,
    });
    addWord(lang, ["l", "o", "w"], "water", {
      bornGeneration: 100,
      register: "low",
      synonym: true,
    });
    const rng = makeRng("genre-poetry");
    let highCount = 0;
    let lowCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = pickSynonymForGenre(lang, "water", "poetry", rng);
      if (!result) continue;
      const senseRegister = result.word.senses[result.senseIndex]?.register;
      if (senseRegister === "high") highCount++;
      if (senseRegister === "low") lowCount++;
    }
    // High-register form should beat low-register with poetry weights.
    expect(highCount).toBeGreaterThan(lowCount);
  });

  it("dialogue leans toward low register", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    addWord(lang, ["h", "i", "g", "h"], "water", {
      bornGeneration: 5,
      register: "high",
      synonym: true,
    });
    addWord(lang, ["l", "o", "w"], "water", {
      bornGeneration: 100,
      register: "low",
      synonym: true,
    });
    const rng = makeRng("genre-dialogue");
    let highCount = 0;
    let lowCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = pickSynonymForGenre(lang, "water", "dialogue", rng);
      if (!result) continue;
      const senseRegister = result.word.senses[result.senseIndex]?.register;
      if (senseRegister === "high") highCount++;
      if (senseRegister === "low") lowCount++;
    }
    expect(lowCount).toBeGreaterThan(highCount);
  });
});
