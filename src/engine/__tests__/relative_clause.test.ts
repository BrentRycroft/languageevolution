import { describe, it, expect } from "vitest";
import { driftGrammar } from "../grammar/evolve";
import type { Language, GrammarFeatures } from "../types";
import { makeRng } from "../rng";
import { createSimulation } from "../simulation";
import { presetGermanic } from "../presets/germanic";
import { presetBantu } from "../presets/bantu";
import { translateSentence, type TranslatedToken } from "../translator/sentence";

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

describe("subject-gap relative clause does not emit the gapped subject's determiner", () => {
  const protoOf = (build: () => ReturnType<typeof presetGermanic>, seed: string): Language =>
    createSimulation({ ...build(), seed }).getState().tree["L-0"]!.language;
  const dets = (toks: TranslatedToken[]): number =>
    toks.filter((t) => t.englishLemma === "the").length;
  const lemmas = (toks: TranslatedToken[]): string =>
    toks.map((t) => t.englishLemma).join(" ");

  it("article-bearing subject relative: head NP is the gapped subject — no determiner in the RC subject slot", () => {
    // Germanic has articlePresence "free". The head ("the king") IS the gapped
    // RC subject, so the clause-internal subject surfaces as NOTHING. Only two
    // overt "the" determiners should appear: the matrix subject ("the king")
    // and the RC object ("the wolf") — NOT a stray third "the" between the
    // relativizer ("who") and the RC verb.
    const lang = protoOf(presetGermanic, "rc-gap-art");
    const { targetTokens: t } = translateSentence(lang, "the king who sees the wolf runs");
    expect(lang.grammar.articlePresence).toBe("free");
    expect(dets(t), `expected 2 articles in "${lemmas(t)}"`).toBe(2);
    // No "the" should sit directly between the relativizer and the verb.
    const whoIdx = t.findIndex((x) => x.englishLemma === "who");
    expect(whoIdx, lemmas(t)).toBeGreaterThanOrEqual(0);
    expect(t[whoIdx + 1]?.englishLemma, `stray det after 'who' in "${lemmas(t)}"`).not.toBe("the");
  });

  it("non-subject-gap (object) relative is unaffected: the RC's own subject keeps its determiner", () => {
    // "the wolf that the king sees" — the RC carries its OWN subject ("the
    // king"); subjectGap is false, so that determiner MUST survive. Both the
    // matrix head ("the wolf") and the RC subject ("the king") take an article.
    const lang = protoOf(presetGermanic, "rc-obj-art");
    const { targetTokens: t } = translateSentence(lang, "the wolf that the king sees runs");
    expect(dets(t), `expected 2 articles in "${lemmas(t)}"`).toBe(2);
  });

  it("article-less language is unaffected: subject relative still realises every other word", () => {
    // Bantu has articlePresence "none" — there are no determiners to drop, and
    // the head/relativizer/object/verb material must all survive.
    const lang = protoOf(presetBantu, "rc-gap-noart");
    const { targetTokens: t } = translateSentence(lang, "the king who sees the wolf runs");
    expect(lang.grammar.articlePresence).toBe("none");
    expect(dets(t), `no article language should emit 0 "the" in "${lemmas(t)}"`).toBe(0);
    for (const lemma of ["king", "see", "wolf", "run"]) {
      expect(
        t.some((x) => x.englishLemma === lemma),
        `"${lemma}" should survive in "${lemmas(t)}"`,
      ).toBe(true);
    }
  });
});
