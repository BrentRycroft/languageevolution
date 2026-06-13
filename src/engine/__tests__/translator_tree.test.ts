import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import type { Language } from "../types";
import { tForm as lexGet, tSet as lexSet } from "../lexicon/__tests__/glossSeam";

/**
 * translator_tree.test.ts
 *
 * Test suite for: "§2.1 — tree-driven realisation: word order".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function freshLang(seed: string): Language {
  const sim = createSimulation({ ...defaultConfig(), seed });
  sim.step();
  const lang = sim.getState().tree["L-0"]!.language;
  if (!lexGet(lang, "water")) lexSet(lang, "water", ["w", "a", "t"]);
  if (!lexGet(lang, "see")) lexSet(lang, "see", ["s", "i"]);
  if (!lexGet(lang, "mother")) lexSet(lang, "mother", ["m", "a"]);
  if (!lexGet(lang, "dog")) lexSet(lang, "dog", ["k", "u"]);
  if (!lexGet(lang, "big")) lexSet(lang, "big", ["b", "u", "k"]);
  return lang;
}

describe("§2.1 — tree-driven realisation: word order", () => {
  it("emits subject, verb, object in the language's wordOrder", () => {
    const lang = freshLang("tree-order");
    lang.grammar.wordOrder = "SOV";
    lang.grammar.adjectivePosition = "pre";
    lang.grammar.articlePresence = "none";
    lang.grammar.caseStrategy = "case";
    const out = translateSentence(lang, "the dog sees the mother");
    const arr = out.targetTokens.map((t) => t.englishLemma);
    const sIdx = arr.indexOf("dog");
    const oIdx = arr.indexOf("mother");
    const vIdx = arr.indexOf("see");
    expect(sIdx).toBeGreaterThanOrEqual(0);
    expect(oIdx).toBeGreaterThanOrEqual(0);
    expect(vIdx).toBeGreaterThanOrEqual(0);
    expect(sIdx).toBeLessThan(oIdx);
    expect(oIdx).toBeLessThan(vIdx);
  });

  it("respects SVO when set", () => {
    const lang = freshLang("tree-svo");
    lang.grammar.wordOrder = "SVO";
    const out = translateSentence(lang, "the dog sees the mother");
    const arr = out.targetTokens.map((t) => t.englishLemma);
    const sIdx = arr.indexOf("dog");
    const vIdx = arr.indexOf("see");
    const oIdx = arr.indexOf("mother");
    expect(sIdx).toBeLessThan(vIdx);
    expect(vIdx).toBeLessThan(oIdx);
  });
});

describe("§2.1 — adjective placement", () => {
  it("pre-noun: ADJ comes before head", () => {
    const lang = freshLang("adj-pre");
    lang.grammar.adjectivePosition = "pre";
    const out = translateSentence(lang, "the big dog sees");
    const arr = out.targetTokens.map((t) => t.englishLemma);
    const adj = arr.indexOf("big");
    const noun = arr.indexOf("dog");
    expect(adj).toBeGreaterThanOrEqual(0);
    expect(noun).toBeGreaterThanOrEqual(0);
    expect(adj).toBeLessThan(noun);
  });

  it("post-noun: ADJ comes after head", () => {
    const lang = freshLang("adj-post");
    lang.grammar.adjectivePosition = "post";
    const out = translateSentence(lang, "the big dog sees");
    const arr = out.targetTokens.map((t) => t.englishLemma);
    const adj = arr.indexOf("big");
    const noun = arr.indexOf("dog");
    expect(adj).toBeGreaterThan(noun);
  });
});

describe("§2.1 — negation", () => {
  it("pre-verb negation surfaces a NEG token before the verb", () => {
    const lang = freshLang("neg-pre");
    lang.grammar.negationPosition = "pre-verb";
    const out = translateSentence(lang, "the dog does not see");
    const arr = out.targetTokens.map((t) => t.glossNote);
    const negIdx = arr.indexOf("neg");
    expect(negIdx).toBeGreaterThanOrEqual(0);
    const vIdx = out.targetTokens.findIndex((t) => t.englishLemma === "see");
    expect(vIdx).toBeGreaterThan(negIdx);
  });

  it("morphological suffix negation attaches to the verb", () => {
    const lang = freshLang("neg-suf");
    lang.grammar.negationPosition = "suffix";
    const out = translateSentence(lang, "the dog does not see");
    expect(out.targetTokens.find((t) => t.glossNote === "neg")).toBeUndefined();
  });
});

describe("§2.1 — prodrop", () => {
  it("drops pronoun subject when verb agreement carries it", () => {
    const lang = freshLang("prodrop");
    lang.grammar.prodrop = true;
    lang.morphology.paradigms["verb.person.3sg"] = {
      affix: ["t"],
      position: "suffix",
      category: "verb.person.3sg",
    };
    const out = translateSentence(lang, "she sees the dog");
    const arr = out.targetTokens.map((t) => t.englishLemma);
    expect(arr.includes("she")).toBe(false);
  });

  it("keeps pronoun subject when prodrop is off", () => {
    const lang = freshLang("no-prodrop");
    lang.grammar.prodrop = false;
    const out = translateSentence(lang, "she sees the dog");
    const arr = out.targetTokens.map((t) => t.englishLemma);
    expect(arr.includes("she")).toBe(true);
  });
});
