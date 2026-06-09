import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { coinKeylessLexeme } from "../lexicon/lexemeIdentity";
import { tGlosses as lexKeys } from "../lexicon/__tests__/glossSeam";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { satSet } from "../lexicon/satellites";
import {
  evolvableLexemes, effectiveGlossFor, effectivePosOf, effectiveFormOf, keylessMature,
} from "../lexicon/evolvable";
import type { Language } from "../types";

function rootLang(): Language {
  const s = createSimulation(presetEnglish()).getState();
  return s.tree[s.rootId]!.language;
}

describe("S2b — evolvableLexemes + resolvers", () => {
  it("seeded ids come first in lexKeys order, then keyless ids appended", () => {
    const lang = rootLang();
    const seededCount = lexKeys(lang).length;
    const kid = coinKeylessLexeme(lang, fromFloats(embed("run")), ["r", "u", "n", "o"]);
    const ids = evolvableLexemes(lang);
    expect(ids.length).toBe(seededCount + 1);
    expect(ids[ids.length - 1]).toBe(kid);
    const seededPrefix = ids.slice(0, seededCount).map((id) => effectiveGlossFor(lang, id));
    expect(seededPrefix).toEqual(lexKeys(lang));
  });

  it("resolvers: keyless gloss is emergent; form + POS come from the record/point", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("run")), ["r", "u", "n", "o"]);
    expect(effectiveFormOf(lang, kid)).toEqual(["r", "u", "n", "o"]);
    expect(typeof effectiveGlossFor(lang, kid)).toBe("string");
    expect(effectiveGlossFor(lang, kid).length).toBeGreaterThan(0);
    expect(effectivePosOf(lang, kid)).toBeDefined();
  });

  it("keylessMature: fresh keyless (freq 0.4) is immature; raising freq matures it", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("run")), ["r", "u", "n", "o"]);
    expect(keylessMature(lang, kid)).toBe(false);
    satSet(lang, "wordFrequencyHints", kid, 0.6);
    expect(keylessMature(lang, kid)).toBe(true);
  });
});
