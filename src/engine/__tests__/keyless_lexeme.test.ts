import { describe, it, expect } from "vitest";
import { coinKeylessLexeme, keylessGloss } from "../lexicon/lexemeIdentity";
import { cloneLanguage } from "../utils/clone";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { glossOf } from "../semantics/anchors";
import type { Language } from "../types";

function bareLang(): Language {
  return {
    id: "L-0", name: "Proto", lexemes: {}, lexemeIds: {},
    enabledChangeIds: [], changeWeights: {}, birthGeneration: 0,
    grammar: {}, events: [], wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} }, localNeighbors: {}, conservatism: 1,
    wordOrigin: {}, activeRules: [], orthography: {}, otRanking: [], lastChangeGeneration: {},
  } as unknown as Language;
}

describe("keyless lexemes — point-native storage (no concept key)", () => {
  it("coins a lexeme defined purely by point + form, with NO gloss/concept key", () => {
    const lang = bareLang();
    const point = fromFloats(embed("fire"));
    const id = coinKeylessLexeme(lang, point, ["b", "l", "a", "z"]);

    // Stored as a GLOSS-LESS record in lang.lexemes — not in the gloss-addressed lexemeIds index.
    expect(lang.lexemes[id]).toBeDefined();
    expect(lang.lexemes[id]!.form).toEqual(["b", "l", "a", "z"]);
    expect(lang.lexemes[id]!.gloss).toBeUndefined(); // keyless — no concept key
    expect(lang.lexemeIds).toEqual({}); // no gloss anchor at all
  });

  it("its meaning is the point; its label is EMERGENT (nearest anchor)", () => {
    const lang = bareLang();
    const id = coinKeylessLexeme(lang, fromFloats(embed("fire")), ["b", "l", "a", "z"]);
    // parked on fire's anchor → emergent gloss is "fire", with no stored concept key.
    expect(keylessGloss(lang.lexemes[id]!)).toBe("fire");
    expect(keylessGloss(lang.lexemes[id]!)).toBe(glossOf(fromFloats(embed("fire"))));
  });

  it("mints distinct ids and is deterministic", () => {
    const a = bareLang();
    const id1 = coinKeylessLexeme(a, fromFloats(embed("water")), ["a"]);
    const id2 = coinKeylessLexeme(a, fromFloats(embed("stone")), ["b"]);
    expect(id1).not.toBe(id2);
    const b = bareLang();
    expect(coinKeylessLexeme(b, fromFloats(embed("water")), ["a"])).toBe(id1); // same lang.id+seq
  });

  it("survives a language clone (deep-copied, independent)", () => {
    const lang = bareLang();
    const id = coinKeylessLexeme(lang, fromFloats(embed("fire")), ["b", "l", "a", "z"]);
    const copy = cloneLanguage(lang);
    expect(copy.lexemes[id]!.form).toEqual(["b", "l", "a", "z"]);
    copy.lexemes[id]!.form.push("x");
    expect(lang.lexemes[id]!.form).toEqual(["b", "l", "a", "z"]); // original unchanged
  });
});
