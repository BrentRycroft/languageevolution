import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import type { Language } from "../types";
import type { Paradigm } from "../morphology/types";

function freshLang(seed: string): Language {
  const sim = createSimulation({ ...defaultConfig(), seed });
  sim.step();
  const lang = sim.getState().tree["L-0"]!.language;
  if (!lang.lexicon["king"]) lang.lexicon["king"] = ["k", "i", "n"];
  if (!lang.lexicon["dog"]) lang.lexicon["dog"] = ["k", "u"];
  if (!lang.lexicon["see"]) lang.lexicon["see"] = ["s", "i"];
  if (!lang.lexicon["water"]) lang.lexicon["water"] = ["w", "a", "t"];
  if (!lang.lexicon["wolf"]) lang.lexicon["wolf"] = ["w", "u", "l"];
  if (!lang.lexicon["big"]) lang.lexicon["big"] = ["b", "u", "k"];
  if (!lang.lexicon["three"]) lang.lexicon["three"] = ["t", "r", "i"];
  return lang;
}

function p(category: Paradigm["category"], affix: string[], position: "prefix" | "suffix" = "suffix"): Paradigm {
  return { affix, position, category };
}

describe("§gap-1 — genitive case on possessor NPs", () => {
  it("possessor NP gets noun.case.gen morphology when role=POSS", () => {
    const lang = freshLang("gen-1");
    lang.grammar.hasCase = true;
    lang.morphology.paradigms["noun.case.acc"] = p("noun.case.acc", ["m"]);
    lang.morphology.paradigms["noun.case.gen"] = p("noun.case.gen", ["s"]);
    const out = translateSentence(lang, "the king sees the dog");
    const dog = out.targetTokens.find((t) => t.englishLemma === "dog");
    expect(dog?.targetSurface).toMatch(/m$/);
    const king = out.targetTokens.find((t) => t.englishLemma === "king");
    expect(king?.targetSurface).not.toMatch(/[sm]$/);
  });
});

describe("§gap-2 — adjective-noun number agreement", () => {
  it("plural noun head pulls the adjective into adj.num.pl", () => {
    const lang = freshLang("adj-pl");
    lang.morphology.paradigms["noun.num.pl"] = p("noun.num.pl", ["i"]);
    lang.morphology.paradigms["adj.num.pl"] = p("adj.num.pl", ["s"]);
    const out = translateSentence(lang, "the big kings see");
    const adj = out.targetTokens.find((t) => t.englishLemma === "big");
    expect(adj?.targetSurface).toMatch(/s$/);
  });

  it("singular noun head leaves the adjective bare", () => {
    const lang = freshLang("adj-sg");
    lang.morphology.paradigms["adj.num.pl"] = p("adj.num.pl", ["s"]);
    const out = translateSentence(lang, "the big king sees");
    const adj = out.targetTokens.find((t) => t.englishLemma === "big");
    expect(adj?.targetSurface).not.toMatch(/s$/);
  });
});

describe("§gap-3 — comparative + superlative degree", () => {
  it("comparative '-er' applies adj.degree.cmp paradigm", () => {
    const lang = freshLang("cmp");
    lang.morphology.paradigms["adj.degree.cmp"] = p("adj.degree.cmp", ["e", "r"]);
    const out = translateSentence(lang, "the bigger dog sees");
    const adj = out.targetTokens.find((t) => t.englishLemma === "big");
    expect(adj?.targetSurface).toMatch(/er$/);
  });

  it("superlative '-est' applies adj.degree.sup paradigm", () => {
    const lang = freshLang("sup");
    lang.morphology.paradigms["adj.degree.sup"] = p("adj.degree.sup", ["e", "s", "t"]);
    const out = translateSentence(lang, "the biggest dog sees");
    const adj = out.targetTokens.find((t) => t.englishLemma === "big");
    expect(adj?.targetSurface).toMatch(/est$/);
  });
});

describe("§gap-4 — classifier system", () => {
  it("classifierSystem inserts a CLF token between numeral and noun", () => {
    const lang = freshLang("clf");
    lang.grammar.classifierSystem = true;
    const out = translateSentence(lang, "three dogs see");
    const surfaces = out.targetTokens.map((t) => t.targetSurface);
    const numIdx = surfaces.findIndex((_s, i) => out.targetTokens[i]!.englishLemma === "three");
    const clfIdx = surfaces.findIndex((_s, i) => out.targetTokens[i]!.englishLemma.startsWith("CLF"));
    const dogIdx = surfaces.findIndex((_s, i) => out.targetTokens[i]!.englishLemma === "dog");
    expect(numIdx).toBeGreaterThanOrEqual(0);
    expect(clfIdx).toBeGreaterThan(numIdx);
    expect(dogIdx).toBeGreaterThan(clfIdx);
  });

  it("classifierSystem off: no CLF emitted", () => {
    const lang = freshLang("clf-off");
    lang.grammar.classifierSystem = false;
    const out = translateSentence(lang, "three dogs see");
    expect(out.targetTokens.find((t) => t.englishLemma === "CLF")).toBeUndefined();
  });
});

describe("§gap-5 — noun incorporation", () => {
  it("incorporates fuses bare object root into verb stem", () => {
    const lang = freshLang("incorp");
    lang.grammar.incorporates = true;
    const out = translateSentence(lang, "the king sees water");
    expect(out.targetTokens.find((t) => t.englishLemma === "water")).toBeUndefined();
    const verb = out.targetTokens.find((t) => t.englishLemma === "see");
    expect(verb?.targetSurface).toContain("wat");
  });

  it("incorporates does NOT fuse modified object NPs", () => {
    const lang = freshLang("incorp-mod");
    lang.grammar.incorporates = true;
    const out = translateSentence(lang, "the king sees the big water");
    expect(out.targetTokens.find((t) => t.englishLemma === "water")).toBeDefined();
  });
});

describe("§gap-6 — synthesisIndex caps verb-affix stack depth", () => {
  it("low synthesis (analytical) emits at most one inflection on the verb", () => {
    const lang = freshLang("synth-lo");
    lang.grammar.synthesisIndex = 1;
    lang.morphology.paradigms["verb.tense.past"] = p("verb.tense.past", ["d"]);
    lang.morphology.paradigms["verb.person.3sg"] = p("verb.person.3sg", ["t"]);
    const out = translateSentence(lang, "the king saw the wolf");
    const v = out.targetTokens.find((t) => t.englishLemma === "see");
    const ends = v?.targetSurface ?? "";
    const hasPast = /d$/.test(ends);
    const hasPerson = /t$/.test(ends);
    expect(hasPast && hasPerson).toBe(false);
  });

  it("high synthesis stacks multiple inflections", () => {
    const lang = freshLang("synth-hi");
    lang.grammar.synthesisIndex = 4;
    lang.morphology.paradigms["verb.tense.past"] = p("verb.tense.past", ["d"]);
    lang.morphology.paradigms["verb.person.3sg"] = p("verb.person.3sg", ["t"]);
    const out = translateSentence(lang, "the king saw the wolf");
    const v = out.targetTokens.find((t) => t.englishLemma === "see");
    expect(v?.targetSurface).toMatch(/dt$/);
  });
});

describe("§gap-7 — aspect/mood/voice cues from auxiliaries", () => {
  it("'is X-ing' triggers verb.aspect.prog", () => {
    const lang = freshLang("prog");
    lang.grammar.synthesisIndex = 4;
    lang.morphology.paradigms["verb.aspect.prog"] = p("verb.aspect.prog", ["i", "n", "g"]);
    const out = translateSentence(lang, "the king is seeing");
    const v = out.targetTokens.find((t) => t.englishLemma === "see");
    expect(v?.targetSurface).toContain("ing");
  });

  it("'was X-ed' triggers verb.voice.pass", () => {
    const lang = freshLang("pass");
    lang.grammar.synthesisIndex = 4;
    lang.morphology.paradigms["verb.voice.pass"] = p("verb.voice.pass", ["u", "s"]);
    const out = translateSentence(lang, "the king was seen");
    const v = out.targetTokens.find((t) => t.englishLemma === "see");
    expect(v?.targetSurface).toContain("us");
  });

  it("'should X' triggers verb.mood.subj", () => {
    const lang = freshLang("subj");
    lang.grammar.synthesisIndex = 4;
    lang.morphology.paradigms["verb.mood.subj"] = p("verb.mood.subj", ["e", "t"]);
    const out = translateSentence(lang, "the king should see");
    const v = out.targetTokens.find((t) => t.englishLemma === "see");
    expect(v?.targetSurface).toContain("et");
  });

  it("verb-initial input (imperative) triggers verb.mood.imp", () => {
    const lang = freshLang("imp");
    lang.grammar.synthesisIndex = 4;
    lang.morphology.paradigms["verb.mood.imp"] = p("verb.mood.imp", ["a"]);
    const out = translateSentence(lang, "see the king");
    const v = out.targetTokens.find((t) => t.englishLemma === "see");
    expect(v?.targetSurface).toContain("a");
  });
});

describe("§gap-8 — yes/no question strategies", () => {
  it("intonation: appends '?' to the sentence", () => {
    const lang = freshLang("q-int");
    lang.grammar.interrogativeStrategy = "intonation";
    const out = translateSentence(lang, "is the king seeing?");
    expect(out.targetTokens[out.targetTokens.length - 1]!.targetSurface).toBe("?");
  });

  it("particle (final): emits a Q particle at the end", () => {
    const lang = freshLang("q-part");
    lang.grammar.interrogativeStrategy = "particle";
    lang.grammar.interrogativeParticle = "final";
    const out = translateSentence(lang, "is the king seeing?");
    const last = out.targetTokens[out.targetTokens.length - 1]!;
    expect(last.englishLemma).toBe("Q");
  });

  it("particle (initial): emits a Q particle at the start", () => {
    const lang = freshLang("q-part-i");
    lang.grammar.interrogativeStrategy = "particle";
    lang.grammar.interrogativeParticle = "initial";
    const out = translateSentence(lang, "is the king seeing?");
    const first = out.targetTokens[0]!;
    expect(first.englishLemma).toBe("Q");
  });

  it("inversion: verb precedes subject regardless of base wordOrder", () => {
    const lang = freshLang("q-inv");
    lang.grammar.interrogativeStrategy = "inversion";
    lang.grammar.wordOrder = "SOV";
    const out = translateSentence(lang, "is the king seeing the wolf?");
    const arr = out.targetTokens.map((t) => t.englishLemma);
    const vIdx = arr.indexOf("see");
    const sIdx = arr.indexOf("king");
    expect(vIdx).toBeLessThan(sIdx);
  });
});

describe("§gap-9 — fusionIndex collapses adjacent duplicate phonemes at affix seams", () => {
  it("agglutinative (low fusion) keeps the seam visible", () => {
    const lang = freshLang("agg");
    lang.lexicon["go"] = ["g", "o", "d"];
    lang.grammar.synthesisIndex = 4;
    lang.grammar.fusionIndex = 0.0;
    lang.morphology.paradigms["verb.tense.past"] = p("verb.tense.past", ["d", "e"]);
    const out = translateSentence(lang, "the king went");
    const v = out.targetTokens.find((t) => t.englishLemma === "go");
    expect(v?.targetSurface).toMatch(/dd/);
  });

  it("fusional (high fusion) collapses the seam", () => {
    const lang = freshLang("fus");
    lang.lexicon["go"] = ["g", "o", "d"];
    lang.grammar.synthesisIndex = 4;
    lang.grammar.fusionIndex = 0.9;
    lang.morphology.paradigms["verb.tense.past"] = p("verb.tense.past", ["d", "e"]);
    const out = translateSentence(lang, "the king went");
    const v = out.targetTokens.find((t) => t.englishLemma === "go");
    expect(v?.targetSurface).not.toMatch(/dd/);
  });
});

describe("§gap-1b — genitive surfaces from 'X of Y' English construction", () => {
  it("'the dog of the king' renders king with noun.case.gen morphology", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "of-gen" });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    if (!lang.lexicon["king"]) lang.lexicon["king"] = ["k", "i", "n"];
    if (!lang.lexicon["dog"]) lang.lexicon["dog"] = ["k", "u"];
    if (!lang.lexicon["see"]) lang.lexicon["see"] = ["s", "i"];
    lang.grammar.hasCase = true;
    lang.grammar.caseStrategy = "case";
    lang.morphology.paradigms["noun.case.gen"] = p("noun.case.gen", ["s"]);
    const out = translateSentence(lang, "the dog of the king sees");
    const king = out.targetTokens.find((t) => t.englishLemma === "king");
    expect(king?.targetSurface).toMatch(/s$/);
  });
});
