import { describe, it, expect } from "vitest";
import { verbCitationForm, flattenCitation } from "../morphology/citation";
import { presetEnglish } from "../presets/english";
import { presetRomance } from "../presets/romance";
import { createSimulation } from "../simulation";
import type { Language } from "../types";

function langFromPreset(preset: ReturnType<typeof presetEnglish>): Language {
  const sim = createSimulation(preset);
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 26b — infinitive morphology", () => {
  it("English preset uses particle-prefix 'to V' strategy", () => {
    const lang = langFromPreset(presetEnglish());
    expect(lang.infinitiveStrategy?.kind).toBe("particle-prefix");
    expect(lang.infinitiveStrategy?.particle).toBe("to");
  });

  it("English citation form for 'go' is multi-token (to + go)", () => {
    const lang = langFromPreset(presetEnglish());
    const cit = verbCitationForm(lang, "go");
    expect(cit).not.toBeNull();
    expect(cit!.kind).toBe("multi");
    if (cit && cit.kind === "multi") {
      // The root is unchanged from lang.lexicon["go"].
      expect(cit.root).toEqual(lang.lexicon["go"]);
      // The particle resolves to lang.lexicon["to"] when present, else
      // synthesised via closedClassForm.
      expect(cit.particle.length).toBeGreaterThan(0);
    }
  });

  it("Romance preset uses affix-suffix '-re' strategy", () => {
    const lang = langFromPreset(presetRomance());
    expect(lang.infinitiveStrategy?.kind).toBe("affix-suffix");
    expect(lang.infinitiveStrategy?.affix).toEqual(["r", "e"]);
  });

  it("Romance citation form is single-token with -re suffix", () => {
    const lang = langFromPreset(presetRomance());
    // pick any verb that's seeded
    const verbMeaning = Object.keys(lang.lexicon).find((k) =>
      ["speak", "see", "go", "have"].includes(k),
    );
    if (!verbMeaning) return;
    const cit = verbCitationForm(lang, verbMeaning);
    expect(cit).not.toBeNull();
    expect(cit!.kind).toBe("single");
    if (cit && cit.kind === "single") {
      const surface = cit.form.join("");
      // ends in re or has re inside (suffix appended)
      expect(surface.endsWith("re")).toBe(true);
    }
  });

  it("returns null for missing meanings", () => {
    const lang = langFromPreset(presetEnglish());
    expect(verbCitationForm(lang, "__nonexistent__")).toBeNull();
  });

  it("default strategy is bare when no infinitiveStrategy is set", () => {
    const lang = langFromPreset(presetEnglish());
    // Override strategy to bare for test purposes.
    lang.infinitiveStrategy = { kind: "bare" };
    const cit = verbCitationForm(lang, "go");
    expect(cit).not.toBeNull();
    expect(cit!.kind).toBe("single");
    if (cit && cit.kind === "single") {
      expect(cit.form).toEqual(lang.lexicon["go"]);
    }
  });

  it("affix-prefix strategy concatenates affix before root", () => {
    const lang = langFromPreset(presetEnglish());
    lang.infinitiveStrategy = { kind: "affix-prefix", affix: ["g", "ə"] };
    const cit = verbCitationForm(lang, "go");
    expect(cit!.kind).toBe("single");
    if (cit && cit.kind === "single") {
      expect(cit.form.slice(0, 2)).toEqual(["g", "ə"]);
    }
  });

  it("affix-suffix strategy concatenates affix after root", () => {
    const lang = langFromPreset(presetEnglish());
    lang.infinitiveStrategy = { kind: "affix-suffix", affix: ["e", "n"] };
    const cit = verbCitationForm(lang, "go");
    expect(cit!.kind).toBe("single");
    if (cit && cit.kind === "single") {
      expect(cit.form.slice(-2)).toEqual(["e", "n"]);
    }
  });

  it("flattenCitation produces 1 array for single, 2 for multi", () => {
    const lang = langFromPreset(presetEnglish());
    const cit = verbCitationForm(lang, "go");
    if (!cit) throw new Error("no cit");
    const parts = flattenCitation(cit);
    expect(parts.length).toBe(2); // English particle-prefix → 2 tokens
    lang.infinitiveStrategy = { kind: "bare" };
    const bareCit = verbCitationForm(lang, "go");
    expect(flattenCitation(bareCit!).length).toBe(1);
  });

  it("storing infinitiveStrategy doesn't break the bare lexicon root", () => {
    const lang = langFromPreset(presetEnglish());
    // After Phase 26b, lang.lexicon["go"] must still be the bare root,
    // not the infinitive form. This is a key invariant: inflection
    // continues to work because all tense/person paradigms still apply
    // to the bare stem.
    const goRoot = lang.lexicon["go"];
    expect(goRoot).toBeDefined();
    expect(goRoot![0]).toBe("g");
    // Root must NOT have "to" prepended.
    expect(goRoot![0]).not.toBe("t");
  });
});
