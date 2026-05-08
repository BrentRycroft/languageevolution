import { describe, it, expect } from "vitest";
import { generateDiscourseNarrative } from "../narrative/discourse_generate";
import { mention, makeDiscourse } from "../narrative/discourse";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";

describe("Phase 65 T1 — article discourse-context gating", () => {
  it("mention() increments mentionCount; first call is 1, second is 2", () => {
    const ctx = makeDiscourse("daily");
    const ent = mention(ctx, "king");
    expect(ent.mentionCount).toBe(1);
    const ent2 = mention(ctx, "king");
    expect(ent2.mentionCount).toBe(2);
    expect(ent2).toBe(ent);
  });

  it("first-mention NPs emit indefinite 'a/an'; later mentions emit 'the'", () => {
    const sim = createSimulation({ ...presetEnglish(), seed: "art-defin" });
    sim.step();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;

    const lines = generateDiscourseNarrative(lang, "art-defin-narr", {
      genre: "myth",
      lines: 8,
      script: "ipa",
    });

    // Across the narrative there should be at least 1 indefinite "a"
    // emission (first introduction of an entity) and at least 1
    // definite "the" emission (subsequent mention).
    let aCount = 0;
    let theCount = 0;
    for (const line of lines) {
      const tokens = line.english.toLowerCase().split(/\s+/);
      for (const tok of tokens) {
        if (tok === "a" || tok === "an") aCount++;
        if (tok === "the") theCount++;
      }
    }
    expect(aCount).toBeGreaterThanOrEqual(1);
    expect(theCount).toBeGreaterThanOrEqual(1);
  });

  it("Romance preset (no articlePresence: free at start) emits no DETs initially", async () => {
    const { presetRomance } = await import("../presets/romance");
    const sim = createSimulation({ ...presetRomance(), seed: "art-rom" });
    sim.step();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    expect(lang.grammar.articlePresence).toBe("none");
    // Generating a narrative shouldn't produce any "the" / "a" tokens
    // (because articlePresence is "none", articleRoleToken returns null).
    const lines = generateDiscourseNarrative(lang, "art-rom-narr", {
      genre: "daily",
      lines: 4,
      script: "ipa",
    });
    let det = 0;
    for (const line of lines) {
      const tokens = line.english.toLowerCase().split(/\s+/);
      for (const tok of tokens) {
        if (tok === "the" || tok === "a" || tok === "an") det++;
      }
    }
    expect(det).toBe(0);
  });
});
