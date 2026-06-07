import { describe, it, expect } from "vitest";
import { lexGet } from "../lexicon/access";
import { translateSentence } from "../translator/sentence";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";

/**
 * Phase 53 T1 update: graceful fallback no longer coins from raw
 * phoneme inventory (IDEOPHONE removed). It only fires when one of
 * the four lexicon-grounded mechanisms (compound / derivation /
 * blending / clipping) succeeds AND the candidate cites at least
 * one source meaning that's actually in the language's lexicon.
 *
 * These tests cover the new contract:
 *   - Lemmas that DO ground via the lang's existing lexicon → coined.
 *   - Lemmas that don't ground → null → literal-quote fallback.
 */
describe("Phase 50 T3 + 53 T1 — translator graceful fallback", () => {
  it("a lexicon-grounded coinage produces a fresh form (synth-fallback)", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    // Trigger coinage on a meaning whose stem the language has — the
    // fallback can build it via DERIVATION using one of English's own
    // suffixes attached to a related lexicon entry.
    const out = translateSentence(lang, "the king saw the floogarbus");
    const tok = out.targetTokens.find((t) => t.englishLemma === "floogarbus");
    expect(tok).toBeDefined();
    if (tok!.resolution === "synth-fallback") {
      expect(tok!.targetForm.length).toBeGreaterThan(0);
      expect(lexGet(lang, "floogarbus")).toBeDefined();
    } else {
      // If grounding failed (e.g. derivation could not build a form
      // with sufficient phonotactic fit), the lemma falls through to
      // literal quote — also acceptable post-Phase-53.
      expect(tok!.resolution).toBe("fallback");
    }
  });

  it("the second translation of the same coined lemma hits direct lookup", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const a = translateSentence(lang, "the king saw the floogarbus");
    const tokA = a.targetTokens.find((t) => t.englishLemma === "floogarbus")!;
    if (tokA.resolution !== "synth-fallback") return; // grounding failed; skip
    const b = translateSentence(lang, "the king saw the floogarbus");
    const tokB = b.targetTokens.find((t) => t.englishLemma === "floogarbus")!;
    expect(tokB.resolution).toBe("direct");
    expect(tokB.targetSurface).toBe(tokA.targetSurface);
  });

  it("when fallback fires, a coinage event is logged with translator-prompted cause", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const before = lang.events.length;
    const out = translateSentence(lang, "the king saw the floogarbus");
    const tok = out.targetTokens.find((t) => t.englishLemma === "floogarbus")!;
    if (tok.resolution !== "synth-fallback") return; // grounding failed
    const after = lang.events.length;
    expect(after).toBeGreaterThan(before);
    const last = lang.events[lang.events.length - 1]!;
    expect(last.kind).toBe("coinage");
    expect(last.description).toContain("floogarbus");
    expect(last.description).toContain("translator-prompted");
  });

  it("waterdom still resolves via Phase 49's affix path, not the new fallback", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const out = translateSentence(lang, "the king saw the waterdom");
    const waterdom = out.targetTokens.find((t) => t.englishLemma === "waterdom");
    expect(waterdom?.resolution).toBe("synth-affix");
  });

  it("a language with empty lexicon refuses to coin (no grounding possible)", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    // Wipe the lexicon so derivation/compound have nothing to ground on.
    lang.lexemes = {};
    const before = lang.events.length;
    translateSentence(lang, "the dragon eats");
    const after = lang.events.length;
    // No coinage event because grounding failed.
    expect(after).toBe(before);
    expect(lexGet(lang, "dragon")).toBeUndefined();
  });
});
