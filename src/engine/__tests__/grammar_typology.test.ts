import { describe, it, expect } from "vitest";
import { posOf, isClosedClass } from "../lexicon/pos";
import { translateSentence } from "../translator/sentence";
import { closedClassTable } from "../translator/closedClass";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import type { Language } from "../types";

describe("§1.2 — expanded POS taxonomy", () => {
  it("tags articles, determiners, prepositions, conjunctions distinctly", () => {
    expect(posOf("the")).toBe("article");
    expect(posOf("a")).toBe("article");
    expect(posOf("this")).toBe("determiner");
    expect(posOf("my")).toBe("determiner");
    expect(posOf("in")).toBe("preposition");
    expect(posOf("of")).toBe("preposition");
    expect(posOf("and")).toBe("coord_conj");
    expect(posOf("or")).toBe("coord_conj");
    expect(posOf("because")).toBe("subord_conj");
    expect(posOf("when")).toBe("subord_conj");
    expect(posOf("will")).toBe("auxiliary");
    expect(posOf("not")).toBe("negator");
    expect(posOf("just")).toBe("particle");
    expect(posOf("oh")).toBe("interjection");
  });

  it("isClosedClass reports closed-class tags as closed and open as open", () => {
    expect(isClosedClass("article")).toBe(true);
    expect(isClosedClass("preposition")).toBe(true);
    expect(isClosedClass("coord_conj")).toBe(true);
    expect(isClosedClass("auxiliary")).toBe(true);
    expect(isClosedClass("noun")).toBe(false);
    expect(isClosedClass("verb")).toBe(false);
    expect(isClosedClass("adjective")).toBe(false);
    expect(isClosedClass("adverb")).toBe(false);
  });

  it("preserves backwards-compat tags (noun / verb / adjective / pronoun / numeral / other)", () => {
    expect(posOf("water")).toBe("noun");
    expect(posOf("eat")).toBe("verb");
    expect(posOf("big")).toBe("adjective");
    expect(posOf("i")).toBe("pronoun");
    expect(posOf("three")).toBe("numeral");
  });
});

describe("§1.3 — typology axis on GrammarFeatures", () => {
  it("a freshly-created proto carries the new typology fields", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "typology-defaults" });
    sim.step();
    const proto = sim.getState().tree["L-0"]!.language;
    expect(typeof proto.grammar.synthesisIndex).toBe("number");
    expect(typeof proto.grammar.fusionIndex).toBe("number");
    expect(typeof proto.grammar.articlePresence).toBe("string");
    expect(typeof proto.grammar.caseStrategy).toBe("string");
  });
});

describe("§1.4 — article placement per articlePresence", () => {
  function langWithArticleMode(
    seed: string,
    mode: "none" | "free" | "enclitic" | "proclitic",
  ): Language {
    const sim = createSimulation({ ...defaultConfig(), seed });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    lang.grammar.articlePresence = mode;
    lang.grammar.caseStrategy = "preposition";
    // Ensure the dictionary has a noun for "water" so the translator
    // has a concrete target to attach an article to.
    if (!lang.lexicon["water"]) lang.lexicon["water"] = ["w", "a", "t"];
    return lang;
  }

  it("none: drops articles entirely", () => {
    const lang = langWithArticleMode("art-none", "none");
    const out = translateSentence(lang, "The water");
    // The translator may reorder; just check that no token corresponds
    // to an article emit.
    expect(out.targetTokens.find((t) => t.glossNote === "art")).toBeUndefined();
  });

  it("free: emits the article as a separate token", () => {
    const lang = langWithArticleMode("art-free", "free");
    const out = translateSentence(lang, "The water");
    expect(out.targetTokens.find((t) => t.glossNote === "art")).toBeDefined();
  });

  it("enclitic: attaches the article to the noun's form", () => {
    const lang = langWithArticleMode("art-encl", "enclitic");
    const out = translateSentence(lang, "The water");
    // The noun token's surface should be longer than the bare lexicon
    // form (3 phonemes, "wat").
    const nounTok = out.targetTokens.find((t) => t.englishLemma === "water");
    expect(nounTok).toBeDefined();
    expect(nounTok!.targetForm.length).toBeGreaterThan(3);
    // No standalone article token.
    expect(out.targetTokens.find((t) => t.glossNote === "art")).toBeUndefined();
  });

  it("proclitic: attaches the article to the front of the noun", () => {
    const lang = langWithArticleMode("art-procl", "proclitic");
    const out = translateSentence(lang, "The water");
    const nounTok = out.targetTokens.find((t) => t.englishLemma === "water");
    expect(nounTok).toBeDefined();
    expect(nounTok!.targetForm.length).toBeGreaterThan(3);
  });
});

describe("§1.5 — preposition gating per caseStrategy", () => {
  function langWithCaseStrategy(
    seed: string,
    strat: "case" | "preposition" | "postposition" | "mixed",
  ): Language {
    const sim = createSimulation({ ...defaultConfig(), seed });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    lang.grammar.caseStrategy = strat;
    if (!lang.lexicon["water"]) lang.lexicon["water"] = ["w", "a", "t"];
    return lang;
  }

  it("case-only languages drop standalone prepositions", () => {
    const lang = langWithCaseStrategy("case-only", "case");
    const out = translateSentence(lang, "in the water");
    expect(out.targetTokens.find((t) => t.glossNote === "prep")).toBeUndefined();
  });

  it("preposition languages emit a preposition token", () => {
    const lang = langWithCaseStrategy("prep", "preposition");
    const out = translateSentence(lang, "in the water");
    expect(out.targetTokens.find((t) => t.glossNote === "prep")).toBeDefined();
  });

  it("postposition languages tag the emit as postp", () => {
    const lang = langWithCaseStrategy("postp", "postposition");
    const out = translateSentence(lang, "in the water");
    expect(out.targetTokens.find((t) => t.glossNote === "postp")).toBeDefined();
  });
});

describe("§1.6 — closed-class lookup determinism", () => {
  it("returns identical forms across repeated calls on the same language", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "cc-determinism" });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    const t1 = closedClassTable(lang);
    const t2 = closedClassTable(lang);
    expect(t1["the"]).toEqual(t2["the"]);
    expect(t1["and"]).toEqual(t2["and"]);
  });

  it("two languages with different ids produce different closed-class forms", () => {
    // Spin up a sim and a daughter so we have two languages that share
    // a lineage but carry different ids — different `L-0` vs `L-0-0`
    // in the hash gives us divergent closed-class tables.
    const sim = createSimulation({ ...defaultConfig(), seed: "cc-divergence" });
    sim.step();
    const proto = sim.getState().tree["L-0"]!.language;
    // Manufacture a sister-like Language: same content, different id +
    // different phoneme inventory (extend it artificially).
    const sister: Language = {
      ...proto,
      id: "L-0-X",
      name: "Sister",
      phonemeInventory: {
        ...proto.phonemeInventory,
        segmental: [...proto.phonemeInventory.segmental, "θ", "ð"],
      },
    };
    const tA = closedClassTable(proto);
    const tB = closedClassTable(sister);
    let differs = 0;
    for (const lemma of Object.keys(tA)) {
      if (tA[lemma]!.join("") !== tB[lemma]!.join("")) differs++;
    }
    expect(differs).toBeGreaterThan(3);
  });

  it("every tracked closed-class lemma resolves to a non-empty form", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "cc-coverage" });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    const t = closedClassTable(lang);
    for (const [lemma, form] of Object.entries(t)) {
      expect(form.length, `${lemma} form is empty`).toBeGreaterThan(0);
    }
  });
});
