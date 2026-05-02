import { describe, it, expect } from "vitest";
import { composeTargetSentence } from "../narrative/composer";
import { makeDiscourse } from "../narrative/discourse";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { addAlt } from "../lexicon/altForms";
import { makeRng } from "../rng";

function englishLang() {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("composer altForms integration", () => {
  it("when pickAltProbability=0, primary form is always used", () => {
    const lang = englishLang();
    addAlt(lang, "horse", ["s", "t", "iː", "d"], "high");
    const ctx = makeDiscourse("legend");
    const out = composeTargetSentence(
      lang,
      {
        shape: "transitive",
        tense: "past",
        needs: { subject: true, object: true, adjective: false, time: false, place: false },
        introducesEntity: true,
      },
      { verb: "see", subject: "horse", object: "bread" },
      ctx,
      "ipa",
      { rng: makeRng("noalt"), pickAltProbability: 0 },
    );
    const horseTok = out.tokens.find((t) => t.englishLemma === "horse");
    expect(horseTok?.targetSurface).not.toContain("stiːd");
  });

  it("when pickAltProbability=1.0, an alt form is used", () => {
    const lang = englishLang();
    addAlt(lang, "horse", ["s", "t", "iː", "d"], "high");
    const ctx = makeDiscourse("legend");
    const out = composeTargetSentence(
      lang,
      {
        shape: "transitive",
        tense: "past",
        needs: { subject: true, object: true, adjective: false, time: false, place: false },
        introducesEntity: true,
      },
      { verb: "see", subject: "horse", object: "bread" },
      ctx,
      "ipa",
      {
        rng: makeRng("alt"),
        pickAltProbability: 1.0,
        genreRegister: "high",
      },
    );
    const horseTok = out.tokens.find((t) => t.englishLemma === "horse");
    expect(horseTok?.targetSurface).toContain("stiːd");
  });

  it("english lemma is always preserved (only target surface differs)", () => {
    const lang = englishLang();
    addAlt(lang, "horse", ["s", "t", "iː", "d"], "high");
    const ctx = makeDiscourse("legend");
    const out = composeTargetSentence(
      lang,
      {
        shape: "transitive",
        tense: "past",
        needs: { subject: true, object: true, adjective: false, time: false, place: false },
        introducesEntity: true,
      },
      { verb: "see", subject: "horse", object: "bread" },
      ctx,
      "ipa",
      { rng: makeRng("alt2"), pickAltProbability: 1.0 },
    );
    expect(out.english.toLowerCase()).toContain("horse");
  });

  it("with no alts in the language, behaviour is identical regardless of probability", () => {
    const lang = englishLang(); // no alts added
    const ctx = makeDiscourse("daily");
    const out0 = composeTargetSentence(
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
      { rng: makeRng("a"), pickAltProbability: 0 },
    );
    const out1 = composeTargetSentence(
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
      { rng: makeRng("b"), pickAltProbability: 1.0 },
    );
    expect(out0.surface).toBe(out1.surface);
  });
});
