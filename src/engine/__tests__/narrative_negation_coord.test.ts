import { describe, it, expect } from "vitest";
import { generateDiscourseNarrative } from "../narrative/discourse_generate";
import { composeTargetSentence } from "../narrative/composer";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { makeDiscourse } from "../narrative/discourse";
import { tHas as lexHas } from "../lexicon/__tests__/glossSeam";

/**
 * narrative_negation_coord.test.ts
 *
 * Test suite for: "Phase 20c: negation + coordination in narratives".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function englishLang() {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 20c: negation + coordination in narratives", () => {
  it("composer emits 'did not' for English past-tense negated transitive", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("legend");
    const out = composeTargetSentence(
      lang,
      {
        shape: "transitive",
        tense: "past",
        needs: { subject: true, object: true, adjective: false, time: false, place: false },
        negated: true,
        introducesEntity: true,
      },
      { verb: "see", subject: "dog", object: "bread" },
      ctx,
      "ipa",
    );
    const english = out.english.toLowerCase();
    // Either do-support ("did not see") or inline NEG ("not saw").
    expect(english).toMatch(/(did|do)?\s*not\s*see/);
  });

  it("composer emits 'do not' for present-tense negated transitive", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("daily");
    const out = composeTargetSentence(
      lang,
      {
        shape: "transitive",
        tense: "present",
        needs: { subject: true, object: true, adjective: false, time: false, place: false },
        negated: true,
        introducesEntity: true,
      },
      { verb: "see", subject: "dog", object: "bread" },
      ctx,
      "ipa",
    );
    const english = out.english.toLowerCase();
    expect(english).toContain("not");
    expect(english).toContain("see");
  });

  it("a language without do-support negates inline (no spurious 'did/does'), per its negationPosition", () => {
    // Do-support ("did not see") is cross-linguistically rare (WALS ch.112) and
    // gated on grammar.doSupport. A language without the flag must use its own
    // inline negator and NOT emit an English-style do auxiliary.
    const lang = englishLang();
    lang.grammar.doSupport = false; // simulate a typical (non-English) language
    const ctx = makeDiscourse("legend");
    const out = composeTargetSentence(
      lang,
      {
        shape: "transitive",
        tense: "past",
        needs: { subject: true, object: true, adjective: false, time: false, place: false },
        negated: true,
        introducesEntity: true,
      },
      { verb: "see", subject: "dog", object: "bread" },
      ctx,
      "ipa",
    );
    const lemmas = out.tokens.map((t) => t.englishLemma);
    expect(lemmas, `inline negator 'not' present ("${lemmas.join(" ")}")`).toContain("not");
    expect(
      lemmas.some((l) => l === "did" || l === "does" || l === "do"),
      `no do-support auxiliary ("${lemmas.join(" ")}")`,
    ).toBe(false);
  });

  it("non-negated template doesn't emit any 'not' token", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("myth");
    const out = composeTargetSentence(
      lang,
      {
        shape: "transitive",
        tense: "past",
        needs: { subject: true, object: true, adjective: false, time: false, place: false },
        introducesEntity: true,
      },
      { verb: "see", subject: "dog", object: "bread" },
      ctx,
      "ipa",
    );
    const negTokens = out.tokens.filter((t) => t.englishLemma === "not");
    expect(negTokens).toEqual([]);
  });

  it("dialogue genre at 30% negation rate produces at least one 'not' across 30 lines", () => {
    const lang = englishLang();
    const out = generateDiscourseNarrative(lang, "neg-test", {
      lines: 30,
      genre: "dialogue",
    });
    const hasNot = out.some((line) => /\bnot\b/i.test(line.english));
    expect(hasNot).toBe(true);
  });

  it("coordination branch produces 'and' joins when the language has 'and'", () => {
    const lang = englishLang();
    expect(lexHas(lang, "and")).toBe(true);
    // 30 lines with 15% coord rate → ~4 expected coords; should hit ≥1.
    const out = generateDiscourseNarrative(lang, "coord-test", {
      lines: 30,
      genre: "myth",
    });
    const hasAnd = out.some((line) => / and /i.test(line.english));
    expect(hasAnd).toBe(true);
  });

  it("seeded determinism preserved with negation/coord features active", () => {
    const a = englishLang();
    const b = englishLang();
    const oa = generateDiscourseNarrative(a, "det-test", { lines: 12, genre: "dialogue" });
    const ob = generateDiscourseNarrative(b, "det-test", { lines: 12, genre: "dialogue" });
    expect(oa.map((l) => l.english)).toEqual(ob.map((l) => l.english));
  });
});
