import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { presetPIE } from "../presets/pie";
import { createSimulation } from "../simulation";
import type { Language } from "../types";

/**
 * Translator stress test. Walks a matrix of (English sentence type
 * × language grammar feature) and asserts the translator produces a
 * non-empty surface for any input that has at least one content
 * token.
 *
 * Catches regressions where:
 *   - A grammar feature change drops tokens silently.
 *   - A specific sentence type (passive, relative clause, wh-question)
 *     fails to parse and the fragment fallback then drops most words.
 *   - Word-order permutations interact badly with PP / coordination.
 */

function clone(lang: Language): Language {
  return JSON.parse(JSON.stringify(lang)) as Language;
}

const SENTENCES: Array<[string, string]> = [
  // Basic SVO with content
  ["the king sees the wolf", "S V O"],
  ["the dogs see the wolves", "plural agreement"],
  // Tense
  ["the king saw the wolf", "past"],
  ["the king will see the wolf", "future"],
  ["the king has seen the wolf", "perfect"],
  ["the king is seeing the wolf", "progressive"],
  // Voice
  ["the wolf is seen by the king", "passive present"],
  ["the wolf was killed by the king", "passive past"],
  // Mood / interrogative
  ["does the king see the wolf", "yes/no Q (do)"],
  ["who sees the wolf", "wh-Q subject"],
  ["where does the king walk", "wh-Q oblique"],
  // Negation
  ["the king does not see the wolf", "negation"],
  ["the king is not happy", "copula negation"],
  // Imperative
  ["see the wolf", "imperative transitive"],
  ["come here", "imperative intransitive"],
  // Copula
  ["the king is happy", "copula + ADJ"],
  ["the king is here", "copula + locative"],
  // Possession
  ["the king's wolf runs", "possessive 's"],
  ["the wolf of the king runs", "of-genitive"],
  ["i have a horse", "have main verb"],
  // Coordination
  ["the king and the wolf eat", "coord subjects"],
  ["the king sees the wolf and the dog", "coord objects"],
  ["the king sees the wolf and the wolf attacks", "coord clauses"],
  // Subordination
  ["the king runs because the wolf chases him", "subord"],
  // Relative clauses
  ["the king who sees the wolf attacks", "subject relative"],
  ["the king sees the wolf which runs", "object relative"],
  ["the king sees the wolf that runs", "that-relative"],
  // Modifiers
  ["the big wolf eats", "attributive ADJ"],
  ["three wolves run", "numeral + plural"],
  ["the king walks at the river", "PP modifier"],
];

const FEATURE_MATRIX: Array<{ override: Partial<Language["grammar"]>; label: string }> = [
  { override: { wordOrder: "SOV" }, label: "SOV" },
  { override: { wordOrder: "SVO" }, label: "SVO" },
  { override: { wordOrder: "VSO" }, label: "VSO" },
  { override: { wordOrder: "VOS" }, label: "VOS" },
  { override: { wordOrder: "OSV" }, label: "OSV" },
  { override: { wordOrder: "OVS" }, label: "OVS" },
  { override: { articlePresence: "free" }, label: "art:free" },
  { override: { articlePresence: "enclitic" }, label: "art:encl" },
  { override: { articlePresence: "proclitic" }, label: "art:proc" },
  { override: { articlePresence: "none" }, label: "art:none" },
  { override: { caseStrategy: "preposition", hasCase: false }, label: "prep" },
  { override: { caseStrategy: "postposition", hasCase: false }, label: "postp" },
  { override: { caseStrategy: "case", hasCase: true }, label: "case" },
  { override: { adjectivePosition: "pre" }, label: "adj-pre" },
  { override: { adjectivePosition: "post" }, label: "adj-post" },
  { override: { negationPosition: "pre-verb" }, label: "neg-pre" },
  { override: { negationPosition: "post-verb" }, label: "neg-post" },
  { override: { negationPosition: "prefix" }, label: "neg-prefix" },
  { override: { negationPosition: "suffix" }, label: "neg-suffix" },
  { override: { prodrop: true }, label: "prodrop" },
  { override: { classifierSystem: true }, label: "clf" },
  { override: { interrogativeStrategy: "particle" }, label: "Q-part" },
  { override: { interrogativeStrategy: "inversion" }, label: "Q-inv" },
];

describe("translator stress test", () => {
  const sim = createSimulation(presetPIE());
  sim.step();
  const baseLang = sim.getState().tree["L-0"]!.language;

  it("never throws on the (sentence × grammar feature) matrix", () => {
    for (const [s] of SENTENCES) {
      for (const cfg of FEATURE_MATRIX) {
        const lang = clone(baseLang);
        Object.assign(lang.grammar, cfg.override);
        expect(() => translateSentence(lang, s)).not.toThrow();
      }
    }
  });

  it("produces non-empty output for every (sentence × grammar feature) pairing", () => {
    const failures: string[] = [];
    for (const [s, label] of SENTENCES) {
      for (const cfg of FEATURE_MATRIX) {
        const lang = clone(baseLang);
        Object.assign(lang.grammar, cfg.override);
        const out = translateSentence(lang, s);
        const surface = out.targetTokens
          .map((t) => t.targetSurface)
          .filter(Boolean)
          .join(" ");
        if (surface.length === 0) {
          failures.push(`[${cfg.label}] ${label}: "${s}" → empty`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("recovers a verb token for every sentence with a verb", () => {
    const lang = clone(baseLang);
    const verbInputs = SENTENCES.filter(
      ([s]) => !["good morning", "fire and water", ""].includes(s),
    );
    for (const [s, label] of verbInputs) {
      const out = translateSentence(lang, s);
      // Tree-driven path emits at least one V-tagged token for any
      // input that parsed as a clause (matrix or relative clause).
      const hasV = out.targetTokens.some((t) => t.englishTag === "V");
      expect(hasV, `${label}: "${s}" produced no V token`).toBe(true);
    }
  });

  it("preserves the antecedent NP in relative clauses", () => {
    const lang = clone(baseLang);
    // "the king sees the wolf which runs" — `runs` clause's subject
    // should be "wolf" (the antecedent), not the matrix subject.
    const out = translateSentence(lang, "the king sees the wolf which runs");
    const englishLemmas = out.targetTokens.map((t) => t.englishLemma);
    // "wolf" should appear at least twice: once in the matrix object,
    // once as the rel-clause subject inherited from the antecedent.
    const wolfCount = englishLemmas.filter((e) => e === "wolf").length;
    expect(wolfCount).toBeGreaterThanOrEqual(2);
  });

  it("preserves coord-clause subject inheritance", () => {
    const lang = clone(baseLang);
    // "the king eats and drinks" — second clause has no overt subject;
    // should inherit "king".
    const out = translateSentence(lang, "the king eats and drinks");
    const englishLemmas = out.targetTokens.map((t) => t.englishLemma);
    const kingCount = englishLemmas.filter((e) => e === "king").length;
    expect(kingCount).toBeGreaterThanOrEqual(2);
    // And "you" must NOT appear (would mean the synthetic-imperative
    // fallback fired by mistake).
    expect(englishLemmas).not.toContain("you");
  });

  it("emits PPs before V in V-final word orders", () => {
    const lang = clone(baseLang);
    lang.grammar.wordOrder = "SOV";
    const out = translateSentence(lang, "the king walks at the river");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    const verbIdx = lemmas.indexOf("walk");
    const riverIdx = lemmas.indexOf("river");
    expect(verbIdx).toBeGreaterThan(-1);
    expect(riverIdx).toBeGreaterThan(-1);
    expect(riverIdx).toBeLessThan(verbIdx);
  });

  it("emits PPs after V in V-medial word orders", () => {
    const lang = clone(baseLang);
    lang.grammar.wordOrder = "SVO";
    const out = translateSentence(lang, "the king walks at the river");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    const verbIdx = lemmas.indexOf("walk");
    const riverIdx = lemmas.indexOf("river");
    expect(verbIdx).toBeGreaterThan(-1);
    expect(riverIdx).toBeGreaterThan(-1);
    expect(riverIdx).toBeGreaterThan(verbIdx);
  });

  it("promotes bare have/has/had to a main verb when no other V exists", () => {
    const lang = clone(baseLang);
    const out = translateSentence(lang, "he had fire");
    const englishLemmas = out.targetTokens.map((t) => t.englishLemma);
    // Should emit a verb (lemma "have"), the subject ("he"), and the
    // object ("fire") — not just "he" + "fire" with no verb.
    expect(englishLemmas).toContain("have");
  });

  it("renders fragments without a verb via the minimal fallback", () => {
    const lang = clone(baseLang);
    const out = translateSentence(lang, "fire and water");
    const englishLemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(englishLemmas).toContain("fire");
    expect(englishLemmas).toContain("water");
    expect(englishLemmas).toContain("and");
  });
});
