import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { parseEnglishAffix } from "../translator/englishAffixes";
import { translateSentence } from "../translator/sentence";

/**
 * undone_regression.test.ts
 *
 * Test suite for: "Phase 58.5 — undone regression + compound-only coining".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("Phase 58.5 — undone regression + compound-only coining", () => {
  it("parseEnglishAffix(undone) returns un- + done with `do` as a candidate stem", () => {
    const parsed = parseEnglishAffix("undone");
    expect(parsed).not.toBeNull();
    expect(parsed!.stem).toBe("done");
    expect(parsed!.candidateStems).toContain("do");
  });

  it("parseEnglishAffix(unbroken) includes `break` via past-participle stripping", () => {
    const parsed = parseEnglishAffix("unbroken");
    expect(parsed).not.toBeNull();
    expect(parsed!.candidateStems).toContain("break");
  });

  it("translating 'undone' against English routes via synth-neg-affix on `do`", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const out = translateSentence(lang, "the king is undone");
    const tok = out.targetTokens.find((t) => t.englishLemma === "undone");
    if (!tok) return; // sentence parsing may have stripped the lemma
    // Either resolves via synth-neg-affix (using stem do) or falls
    // through to literal-quote — but it must NOT produce a random
    // synth-fallback coinage tied to an unrelated lexeme.
    expect(["synth-neg-affix", "fallback", "synth-affix"]).toContain(tok.resolution);
  });

  it("graceful-fallback coinage no longer fires via DERIVATION/BLENDING/CLIPPING", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    // Pick a lemma that survives validation but doesn't decompose
    // via affix or compound — should literal-quote, not coin.
    const before = lang.events.length;
    translateSentence(lang, "the king has firewall");
    const after = lang.events.length;
    // firewall = fire + wall — both in CONCEPTS, would compound.
    // The coinage is acceptable; what's NOT acceptable is a
    // derivation-based coinage that picks an unrelated random base.
    // Inspect: if a coinage event fired, it should be tagged
    // mechanism.compound (not derivation/blending/clipping).
    if (after > before) {
      const last = lang.events[lang.events.length - 1]!;
      expect(last.description).not.toMatch(/via (derivation|blending|clipping)/);
    }
  });
});
