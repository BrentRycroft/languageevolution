import { describe, it, expect } from "vitest";
import { driftGrammar } from "../grammar/evolve";
import type { Language, GrammarFeatures } from "../types";
import { makeRng } from "../rng";

/**
 * relative_clause.test.ts
 *
 * Test suite for: "Phase 67 T4 — relative-clause typological constraints".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function fakeLang(g: Partial<GrammarFeatures>): Language {
  return {
    grammar: {
      wordOrder: "SVO",
      affixPosition: "suffix",
      pluralMarking: "affix",
      tenseMarking: "past",
      hasCase: false,
      genderCount: 0,
      ...g,
    } as GrammarFeatures,
    events: [],
  } as unknown as Language;
}

describe("Phase 67 T4 — relative-clause typological constraints", () => {
  it("OV language never drifts to relativizer", () => {
    const lang = fakeLang({
      wordOrder: "SOV",
      hasCase: true,
      relativeClauseStrategy: "gap",
    });
    const rng = makeRng("rc-ov");
    for (let i = 0; i < 200; i++) {
      driftGrammar(lang.grammar, rng, 1.0, 1000); // huge rate multiplier so the per-rule probability of 0.04 always fires
    }
    expect(lang.grammar.relativeClauseStrategy).not.toBe("relativizer");
  });

  it("VO language never drifts to internal-headed", () => {
    const lang = fakeLang({
      wordOrder: "SVO",
      hasCase: false,
      relativeClauseStrategy: "relativizer",
    });
    const rng = makeRng("rc-vo");
    // Phase 68a T2: pin wordOrder + hasCase per iteration so other
    // drift rules can't flip the constraints out from under us.
    for (let i = 0; i < 200; i++) {
      driftGrammar(lang.grammar, rng, 1.0, 1000);
      lang.grammar.wordOrder = "SVO";
      lang.grammar.hasCase = false;
    }
    expect(lang.grammar.relativeClauseStrategy).not.toBe("internal-headed");
  });

  it("case-poor language never drifts to resumptive", () => {
    const lang = fakeLang({
      wordOrder: "SVO",
      hasCase: false,
      relativeClauseStrategy: "gap",
    });
    const rng = makeRng("rc-nocase");
    for (let i = 0; i < 200; i++) {
      driftGrammar(lang.grammar, rng, 1.0, 1000);
      lang.grammar.wordOrder = "SVO";
      lang.grammar.hasCase = false;
    }
    expect(lang.grammar.relativeClauseStrategy).not.toBe("resumptive");
  });

  it("case-rich SVO can drift to resumptive", () => {
    const lang = fakeLang({
      wordOrder: "SVO",
      hasCase: true,
      relativeClauseStrategy: "gap",
    });
    const rng = makeRng("rc-case");
    let sawResumptive = false;
    for (let i = 0; i < 1000; i++) {
      driftGrammar(lang.grammar, rng, 1.0, 1000);
      if (lang.grammar.relativeClauseStrategy === "resumptive") {
        sawResumptive = true;
        break;
      }
    }
    expect(sawResumptive).toBe(true);
  });
});
