import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";

describe("Phase 50 T3 — translator graceful fallback", () => {
  it("typing an unknown lemma coins a fresh form (no '?' placeholder)", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const out = translateSentence(lang, "the king saw the xyzzy");
    const xyzzy = out.targetTokens.find((t) => t.englishLemma === "xyzzy");
    expect(xyzzy).toBeDefined();
    expect(xyzzy!.targetForm.length).toBeGreaterThan(0);
    expect(xyzzy!.resolution).toBe("synth-fallback");
    // The lemma must now be in the language's lexicon — second
    // translation hits Rung 1.
    expect(lang.lexicon["xyzzy"]).toBeDefined();
  });

  it("the second translation of the same lemma hits the direct lookup", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const a = translateSentence(lang, "the king saw the xyzzy");
    const tokA = a.targetTokens.find((t) => t.englishLemma === "xyzzy")!;
    const b = translateSentence(lang, "the king saw the xyzzy");
    const tokB = b.targetTokens.find((t) => t.englishLemma === "xyzzy")!;
    expect(tokB.resolution).toBe("direct");
    expect(tokB.targetSurface).toBe(tokA.targetSurface);
  });

  it("an event of kind=coinage is logged with cause translator", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const before = lang.events.length;
    translateSentence(lang, "the king saw the floogarbus");
    const after = lang.events.length;
    expect(after).toBeGreaterThan(before);
    const last = lang.events[lang.events.length - 1]!;
    expect(last.kind).toBe("coinage");
    expect(last.description).toContain("floogarbus");
    expect(last.description).toContain("translator-prompted");
  });

  it("two separate sims with the same seed produce the same fallback form", () => {
    const simA = createSimulation(presetEnglish());
    const simB = createSimulation(presetEnglish());
    const langA = simA.getState().tree["L-0"]!.language;
    const langB = simB.getState().tree["L-0"]!.language;
    const a = translateSentence(langA, "the king saw the snorkblat");
    const b = translateSentence(langB, "the king saw the snorkblat");
    const tokA = a.targetTokens.find((t) => t.englishLemma === "snorkblat")!;
    const tokB = b.targetTokens.find((t) => t.englishLemma === "snorkblat")!;
    expect(tokA.targetSurface).toBe(tokB.targetSurface);
  });

  it("waterdom still resolves via Phase 49's affix path, not the new fallback", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const out = translateSentence(lang, "the king saw the waterdom");
    const waterdom = out.targetTokens.find((t) => t.englishLemma === "waterdom");
    expect(waterdom?.resolution).toBe("synth-affix");
  });

  it("wordOrigin records translator-coined etymology", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    translateSentence(lang, "the king saw the wibblefex");
    expect(lang.wordOrigin["wibblefex"]).toMatch(/^translator-coined:/);
  });
});
