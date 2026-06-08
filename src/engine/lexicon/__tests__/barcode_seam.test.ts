import { describe, it, expect } from "vitest";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import {
  lexFormById, lexSetFormById, lexHasById, lexDeleteById, lexIds,
  idForGloss, coinSeededLexeme, lexKeys, lexGet, lexHas,
} from "../access";
import { meaningForLexemeId } from "../lexemeIdentity";

function rootLang() {
  const sim = createSimulation({ ...presetEnglish(), seed: "s3-b0" });
  const st = sim.getState();
  return st.tree[st.rootId]!.language;
}

describe("S3 B0 — barcode-native seam agrees with gloss-in seam", () => {
  it("lexIds positionally matches lexKeys, and id round-trips to its gloss", () => {
    const lang = rootLang();
    const glosses = lexKeys(lang);
    const ids = lexIds(lang);
    expect(ids.length).toBe(glosses.length);
    for (let i = 0; i < ids.length; i++) {
      expect(meaningForLexemeId(lang, ids[i]!)).toBe(glosses[i]);
      expect(idForGloss(lang, glosses[i]!)).toBe(ids[i]);
    }
  });

  it("lexFormById/lexHasById agree with lexGet/lexHas for every gloss", () => {
    const lang = rootLang();
    for (const m of lexKeys(lang)) {
      const id = idForGloss(lang, m)!;
      expect(lexFormById(lang, id)).toEqual(lexGet(lang, m));
      expect(lexHasById(lang, id)).toBe(lexHas(lang, m));
    }
  });

  it("lexSetFormById updates an existing form without minting", () => {
    const lang = rootLang();
    const id = lexIds(lang)[0]!;
    const before = lang.conceptIdSeq;
    lexSetFormById(lang, id, ["a"]);
    expect(lexFormById(lang, id)).toEqual(["a"]);
    expect(lang.conceptIdSeq).toBe(before); // no mint
  });

  it("coinSeededLexeme mints a new word and is the id of its gloss", () => {
    const lang = rootLang();
    const id = coinSeededLexeme(lang, "zzqx-new-concept", ["i"]);
    expect(idForGloss(lang, "zzqx-new-concept")).toBe(id);
    expect(meaningForLexemeId(lang, id)).toBe("zzqx-new-concept");
    lexDeleteById(lang, id);
    expect(lexHasById(lang, id)).toBe(false);
  });
});
