import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetRomance } from "../presets/romance";
import { presetEnglish } from "../presets/english";
import { translateSentence } from "../translator/sentence";

/**
 * phase72b_corrections.test.ts — Phase 72b verifications.
 */

describe("Phase 72b-1 — fragment translator applies tense from AUX cue", () => {
  it('"i went" emits a past-tense form distinct from "i go"', () => {
    const cfg = presetRomance();
    cfg.seed = "p72b-tense";
    const sim = createSimulation(cfg);
    for (let i = 0; i < 5; i++) sim.step(); // warm up
    const lang = sim.getState().tree["L-0"]!.language;
    const present = translateSentence(lang, "i go");
    const past = translateSentence(lang, "i went");
    // The past-tense token should differ from present in surface (or
    // in glossNote if surface is identical due to syncretism).
    const presV = present.targetTokens.find((t) => t.englishLemma === "go");
    const pastV = past.targetTokens.find((t) => t.englishLemma === "go");
    expect(presV).toBeDefined();
    expect(pastV).toBeDefined();
    // Surface OR gloss must differ (Romance ire/eo vs ivi/ii etc.).
    const surfaceEqual = presV!.targetSurface === pastV!.targetSurface;
    const glossEqual = presV!.glossNote === pastV!.glossNote;
    expect(!(surfaceEqual && glossEqual)).toBe(true);
  });
});

describe("Phase 72b-2 — closedClassInventory inheritance", () => {
  it("Romance proto has seedClosedClassInventory populated", () => {
    const cfg = presetRomance();
    cfg.seed = "p72b-cci";
    const sim = createSimulation(cfg);
    const proto = sim.getState().tree["L-0"]!.language;
    expect(proto.closedClassInventory).toBeDefined();
    expect(proto.closedClassInventory!.has("the")).toBe(true);
    expect(proto.closedClassInventory!.has("of")).toBe(true);
  });

  it("Romance daughters inherit closedClassInventory from proto", () => {
    const cfg = presetRomance();
    cfg.seed = "p72b-cci-inherit";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 70; i++) sim.step(); // through M2 split at gen 65
    const leaves = Object.values(sim.getState().tree)
      .filter((n) => n.childrenIds.length === 0)
      .map((n) => n.language)
      .filter((l) => !l.extinct);
    expect(leaves.length).toBeGreaterThan(0);
    for (const lang of leaves) {
      expect(lang.closedClassInventory).toBeDefined();
      expect(lang.closedClassInventory!.has("the")).toBe(true);
    }
  });

  it("English preset (no seedClosedClassInventory) has lang.closedClassInventory undefined", () => {
    const cfg = presetEnglish();
    cfg.seed = "p72b-en-cci";
    const sim = createSimulation(cfg);
    const proto = sim.getState().tree["L-0"]!.language;
    expect(proto.closedClassInventory).toBeUndefined();
  });
});

describe("Phase 72b-4 — terminal-tier grammarPatch trimmed", () => {
  it("M4-M6 daughters do NOT have grammarPatch on initialBias", async () => {
    const { romanceSchedule } = await import("../historical/romance");
    const splitMilestones = romanceSchedule.milestones.filter(
      (m) => m.kind === "split",
    ) as Array<{ atGen: number; daughters: any[] }>;

    // M2 (gen 65) and M3 (gen 100) should still patch.
    const m2 = splitMilestones.find((m) => m.atGen === 65)!;
    const m3 = splitMilestones.find((m) => m.atGen === 100)!;
    expect(m2.daughters.some((d) => d.initialBias?.grammarPatch)).toBe(true);
    expect(m3.daughters.some((d) => d.initialBias?.grammarPatch)).toBe(true);

    // M4-M6 (gen 130) should rely on inheritance now (no grammarPatch).
    const tier130 = splitMilestones.filter((m) => m.atGen === 130);
    for (const m of tier130) {
      for (const d of m.daughters) {
        expect(d.initialBias?.grammarPatch).toBeUndefined();
      }
    }
  });
});
