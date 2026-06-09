import { describe, it, expect } from "vitest";
import { generateNarrative } from "../narrative/generate";
import { formToString } from "../phonology/ipa";
import { tSet as lexSet, tForm as lexGet } from "../lexicon/__tests__/glossSeam";
import type { Language } from "../types";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { DEFAULT_MORPHOLOGY } from "../morphology/defaults";

/**
 * narrative_copula.test.ts
 *
 * The narrative generator's light "simple-render" path (used by
 * languages that don't trigger deep routing) used to emit copular
 * predications as a bare "S A" juxtaposition even when the language
 * had a lexicalised copula. Overt-copula vs zero-copula is a real
 * typological parameter, so a language with "be" should now place the
 * copula like a verb, while a zero-copula language keeps juxtaposition.
 */

function sampleLang(withCopula: boolean): Language {
  const lang: Language = {
    id: "L-cop",
    name: "Copula-test",
    lexemes: {},
    lexemeIds: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    // Plain nom-acc grammar with no deep-routing triggers, so narrative
    // takes the simple-render path this test targets.
    grammar: {
      ...DEFAULT_GRAMMAR,
      wordOrder: "SVO",
      alignment: "nom-acc",
      adjectivePosition: "pre",
      harmony: "none",
      politenessRegister: "none",
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: { ...DEFAULT_MORPHOLOGY.paradigms } },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
  };
  lexSet(lang, "water", ["w", "a", "t", "e", "r"]);
  lexSet(lang, "stone", ["s", "t", "a", "n"]);
  lexSet(lang, "tree", ["t", "r", "e"]);
  lexSet(lang, "see", ["w", "i", "d"]);
  lexSet(lang, "go", ["g", "a", "n"]);
  lexSet(lang, "big", ["m", "a", "g"]);
  lexSet(lang, "good", ["b", "o", "n"]);
  lexSet(lang, "small", ["p", "a", "u"]);
  if (withCopula) lexSet(lang, "be", ["e", "s"]);
  return lang;
}

describe("narrative copula (simple-render path)", () => {
  it("a language with a lexicalised copula emits it in copular lines", () => {
    const lang = sampleLang(true);
    const beSurface = formToString(lexGet(lang, "be")!);
    // 40 lines is plenty for the shape picker (copular gated on
    // hasCopula, ~8% weight/line) to roll at least one copular shape.
    const lines = generateNarrative(lang, "cop-seed", 40, "ipa");
    const copularLines = lines.filter((l) => l.gloss.includes("—be—"));
    expect(
      copularLines.length,
      "expected at least one copular line across 40 generated lines",
    ).toBeGreaterThan(0);
    for (const l of copularLines) {
      expect(
        l.text,
        `copular line should contain the copula form "${beSurface}": "${l.text}"`,
      ).toContain(beSurface);
    }
  });

  it("a zero-copula language (no 'be') never emits a copula in narrative", () => {
    const lang = sampleLang(false);
    const lines = generateNarrative(lang, "cop-seed", 40, "ipa");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => !l.gloss.includes("—be—"))).toBe(true);
  });
});
