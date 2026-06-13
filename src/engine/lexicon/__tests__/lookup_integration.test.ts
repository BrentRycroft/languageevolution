import { describe, it, expect } from "vitest";
import { translateSentence } from "../../translator/sentence";
import { presetEnglish } from "../../presets/english";
import { createSimulation } from "../../simulation";
import type { Paradigm } from "../../morphology/types";
import { applyParadigm } from "../../morphology/apply";
import { inflect } from "../../morphology/evolve";
import { tForm as lexGet } from "./glossSeam";

/**
 * Phase 52 T3 — end-to-end demonstration that the abstraction works
 * for non-concatenative paradigms.
 *
 * We don't ship a separate Tagalog preset (overkill for a phase
 * demo); instead we mutate an English-clone language at runtime,
 * inject a Tagalog-style infix paradigm into an existing morph
 * category, and confirm the translator + the inflector produce the
 * infixed form via the abstraction.
 *
 * The test exercises both:
 *   1. `applyParadigm` directly — confirms dispatch to the infix
 *      branch.
 *   2. `inflect()` on a Word — the path the translator's realiser
 *      uses; confirms the abstraction is wired through `inflect`.
 */
describe("Phase 52 T3 — non-concat paradigm integration", () => {
  it("infix paradigm injected into a language produces infixed forms", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    // Inject a Tagalog-style "after-first-V" infix paradigm. Override
    // the verb.aspect.pfv slot so we can drive it from the translator.
    const infixParadigm: Paradigm = {
      affix: ["u", "m"],
      position: "suffix",
      category: "verb.aspect.pfv",
      kind: "infix",
      insertionPoint: "after-first-V",
    };
    lang.morphology.paradigms["verb.aspect.pfv"] = infixParadigm;

    // Direct applyParadigm sanity check.
    const stem = ["s", "u", "l", "a", "t"];
    expect(applyParadigm(stem, infixParadigm, lang, "stem"))
      .toEqual(["s", "u", "u", "m", "l", "a", "t"]);
  });

  it("inflect() routes through applyParadigm so non-concat dispatch fires", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const infixParadigm: Paradigm = {
      affix: ["u", "m"],
      position: "suffix",
      category: "verb.aspect.pfv",
      kind: "infix",
      insertionPoint: "after-first-V",
    };
    // walk = ["w","ɔ","k"] in English's seed; after infix → w,ɔ,u,m,k.
    const walkForm = lexGet(lang, "walk");
    expect(walkForm).toBeDefined();
    const out = inflect(walkForm!, infixParadigm, lang, "walk");
    // Find the first vowel in walk's IPA form. Inserts "um" right
    // after it.
    expect(out).not.toEqual(walkForm); // changed
    // The "u" + "m" affix should appear contiguously somewhere mid-form.
    const joined = out.join("");
    expect(joined).toContain("um");
  });

  it("reduplicate paradigm produces a doubled stem via the abstraction", () => {
    const par: Paradigm = {
      affix: [],
      position: "suffix",
      category: "noun.num.pl",
      kind: "reduplicate",
      reduplication: "full",
    };
    expect(applyParadigm(["k", "i"], par)).toEqual(["k", "i", "k", "i"]);
  });

  it("ablaut paradigm fires through inflect()", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    const par: Paradigm = {
      affix: [],
      position: "suffix",
      category: "verb.tense.past",
      kind: "ablaut",
      ablautMap: { ɪ: "æ", i: "a" },
    };
    const out = inflect(["s", "ɪ", "ŋ"], par, lang, "sing");
    expect(out).toEqual(["s", "æ", "ŋ"]);
  });

  it("translateSentence with an infix paradigm produces an infixed verb", () => {
    const sim = createSimulation(presetEnglish());
    // Step once so the proto-language settles.
    sim.step();
    const tree = sim.getState().tree;
    const leafId = Object.keys(tree).find(
      (id) => !tree[id]!.language.extinct,
    );
    expect(leafId).toBeDefined();
    const lang = tree[leafId!]!.language;

    // Replace the past-tense paradigm with an infix paradigm.
    lang.morphology.paradigms["verb.tense.past"] = {
      affix: ["u", "m"],
      position: "suffix",
      category: "verb.tense.past",
      kind: "infix",
      insertionPoint: "after-first-V",
    };
    // Crank synthesis index so the verb actually inflects.
    lang.grammar.synthesisIndex = 4;

    const out = translateSentence(lang, "the king walked");
    const verbToken = out.targetTokens.find((t) => t.englishLemma === "walk");
    expect(verbToken).toBeDefined();
    // The output should contain the infix "um" somewhere in the verb
    // surface — confirming the realiser's inflectCascade went through
    // applyParadigm and dispatched to the infix branch.
    expect(verbToken!.targetSurface).toMatch(/.+um.+/);
  });
});
