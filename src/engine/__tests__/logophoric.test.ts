import { describe, it, expect } from "vitest";
import {
  makeDiscourse,
  mention,
  pushQuotedFrame,
  popQuotedFrame,
} from "../narrative/discourse";
import { generateQuotedSpeech } from "../narrative/discourse_generate";
import { closedClassForm } from "../translator/closedClass";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";

describe("Phase 65 T2 — logophoric pronouns surface realization", () => {
  it("pushQuotedFrame and popQuotedFrame manage the logophoric center", () => {
    const ctx = makeDiscourse("legend");
    expect(ctx.logophoricCenter).toBeNull();
    const ent = mention(ctx, "king");
    expect(ctx.logophoricCenter).toBeNull();
    pushQuotedFrame(ctx, ent);
    expect(ctx.logophoricCenter?.meaning).toBe("king");
    expect(ctx.quotedFrameStack.length).toBe(1);
    popQuotedFrame(ctx);
    expect(ctx.logophoricCenter).toBeNull();
    expect(ctx.quotedFrameStack.length).toBe(0);
  });

  it("nested quoted frames stack the logophoric center", () => {
    const ctx = makeDiscourse("legend");
    const a = mention(ctx, "king");
    const b = mention(ctx, "queen");
    pushQuotedFrame(ctx, a);
    expect(ctx.logophoricCenter?.meaning).toBe("king");
    pushQuotedFrame(ctx, b);
    expect(ctx.logophoricCenter?.meaning).toBe("queen");
    popQuotedFrame(ctx);
    expect(ctx.logophoricCenter?.meaning).toBe("king");
    popQuotedFrame(ctx);
    expect(ctx.logophoricCenter).toBeNull();
  });

  it("logophoric language: closed-class 3sg.log returns a synthesized form", () => {
    const config = presetEnglish();
    config.seedGrammar = { ...config.seedGrammar!, referenceTracking: "logophoric" };
    const sim = createSimulation({ ...config, seed: "logo-cc" });
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    const logo3sg = closedClassForm(lang, "3sg.log");
    const logo3pl = closedClassForm(lang, "3pl.log");
    expect(logo3sg).toBeDefined();
    expect(logo3sg!.length).toBeGreaterThan(0);
    expect(logo3pl).toBeDefined();
    // The logophoric form should be DISTINCT from regular he/she.
    const he = closedClassForm(lang, "he");
    const she = closedClassForm(lang, "she");
    expect(logo3sg!.join("")).not.toBe(he?.join(""));
    expect(logo3sg!.join("")).not.toBe(she?.join(""));
  });

  it("generateQuotedSpeech emits 2 lines; embedded clause uses logophoric pronoun for matrix subject", () => {
    const config = presetEnglish();
    config.seedGrammar = { ...config.seedGrammar!, referenceTracking: "logophoric" };
    const sim = createSimulation({ ...config, seed: "logo-quoted" });
    sim.step();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;

    const lines = generateQuotedSpeech(lang, "logo-test", {
      matrixSubject: "king",
      matrixVerb: "say",
      embeddedVerb: "see",
      embeddedObject: "wolf",
      script: "ipa",
    });
    expect(lines.length).toBe(2);
    // The second line's English caption should mention "3sg.log"
    // (the closed-class lemma is preserved through to glossToEnglish).
    expect(lines[1]!.english).toContain("3sg.log");
  });

  it("non-logophoric language: embedded clause uses regular he/she/it", () => {
    // Default English preset has no `referenceTracking` set.
    const sim = createSimulation({ ...presetEnglish(), seed: "logo-none" });
    sim.step();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    expect(lang.grammar.referenceTracking).toBeFalsy();

    const lines = generateQuotedSpeech(lang, "logo-none-test", {
      matrixSubject: "king",
      matrixVerb: "say",
      embeddedVerb: "see",
      embeddedObject: "wolf",
      script: "ipa",
    });
    expect(lines.length).toBe(2);
    // Without logophoric system, the embedded clause uses he.
    expect(lines[1]!.english.toLowerCase()).toMatch(/\bhe\b|\bshe\b|\bit\b/);
    expect(lines[1]!.english).not.toContain("3sg.log");
  });
});
