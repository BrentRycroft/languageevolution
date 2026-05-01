import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { driftGrammar } from "../grammar/evolve";
import { pathwayTargets, semanticTagOf } from "../semantics/grammaticalization";
import { makeRng } from "../rng";
import type { GrammarFeatures, Language, Lexicon } from "../types";
import type { Paradigm } from "../morphology/types";

function defaultGrammar(): GrammarFeatures {
  return {
    wordOrder: "SVO",
    affixPosition: "suffix",
    pluralMarking: "none",
    tenseMarking: "none",
    hasCase: false,
    genderCount: 0,
  };
}

function makeLang(overrides: Partial<Language> = {}, lexicon: Lexicon = {}): Language {
  return {
    id: "L-c",
    name: "TestLang",
    lexicon,
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: defaultGrammar(),
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: ["p", "t", "k", "a", "e", "i", "o", "u", "m", "n", "s", "w"], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    speakers: 10000,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    ...overrides,
  };
}

describe("Phase 14 — completing Phase 12/13", () => {
  describe("honorific trigger", () => {
    it("emits honorific paradigm when input has 'please'", () => {
      const honPdm: Paradigm = { affix: ["s", "a"], position: "suffix", category: "verb.honor.formal" };
      const lang = makeLang(
        {
          grammar: { ...defaultGrammar(), politenessRegister: "binary" },
          morphology: { paradigms: { "verb.honor.formal": honPdm } },
        },
        { i: ["i"], speak: ["t", "a"] },
      );
      const out = translateSentence(lang, "please i speak");
      const verb = out.targetTokens.find((t) => t.englishLemma === "speak");
      expect(verb?.targetSurface).toContain("sa");
    });

    it("emits honorific paradigm when input has 'sir'", () => {
      const honPdm: Paradigm = { affix: ["k", "u"], position: "suffix", category: "verb.honor.formal" };
      const lang = makeLang(
        {
          grammar: { ...defaultGrammar(), politenessRegister: "tiered" },
          morphology: { paradigms: { "verb.honor.formal": honPdm } },
        },
        { i: ["i"], speak: ["t", "a"] },
      );
      const out = translateSentence(lang, "i speak sir");
      const verb = out.targetTokens.find((t) => t.englishLemma === "speak");
      expect(verb?.targetSurface).toContain("ku");
    });

    it("does NOT emit honorific when no trigger word", () => {
      const honPdm: Paradigm = { affix: ["k", "u"], position: "suffix", category: "verb.honor.formal" };
      const lang = makeLang(
        {
          grammar: { ...defaultGrammar(), politenessRegister: "binary" },
          morphology: { paradigms: { "verb.honor.formal": honPdm } },
        },
        { i: ["i"], speak: ["t", "a"] },
      );
      const out = translateSentence(lang, "i speak");
      const verb = out.targetTokens.find((t) => t.englishLemma === "speak");
      expect(verb?.targetSurface).not.toContain("ku");
    });
  });

  describe("resumptive pronoun agreement", () => {
    it("singular human antecedent uses he/him resumptive (not generic 'they')", () => {
      const lang = makeLang(
        {
          grammar: { ...defaultGrammar(), relativeClauseStrategy: "resumptive" },
        },
        {
          man: ["m", "a", "n"],
          dog: ["d", "o", "g"],
          see: ["s", "i"],
          run: ["r", "u"],
          he: ["h", "e"],
        },
      );
      const out = translateSentence(lang, "the man who saw the dog runs");
      const resump = out.targetTokens.find((t) => t.englishLemma.startsWith("RESUMP:"));
      expect(resump, "resumptive token emitted").toBeTruthy();
      expect(resump?.englishLemma).toMatch(/RESUMP:(he|him)/);
    });
  });

  describe("TAM grammaticalisation pathways", () => {
    it("perception verbs feed evidential paradigms", () => {
      expect(semanticTagOf("see")).toBe("perception");
      const targets = pathwayTargets("perception");
      expect(targets).toContain("verb.evid.dir");
      expect(targets).toContain("verb.evid.rep");
      expect(targets).toContain("verb.evid.inf");
    });

    it("possession verbs feed perfect aspect", () => {
      expect(semanticTagOf("have")).toBe("possession");
      const targets = pathwayTargets("possession");
      expect(targets).toContain("verb.aspect.perf");
    });

    it("motion verbs feed prospective aspect", () => {
      expect(semanticTagOf("go")).toBe("motion");
      const targets = pathwayTargets("motion");
      expect(targets).toContain("verb.aspect.prosp");
    });

    it("desire/conditional/honorific tags wire to mood + honor categories", () => {
      expect(pathwayTargets("desire")).toContain("verb.mood.opt");
      expect(pathwayTargets("conditional")).toContain("verb.mood.cond");
      expect(pathwayTargets("honorific")).toContain("verb.honor.formal");
    });
  });

  describe("typology drift", () => {
    it("alignment can drift between systems over many generations", () => {
      const g = defaultGrammar();
      g.hasCase = true;
      const rng = makeRng("drift-align");
      const seen = new Set<string>([g.alignment ?? "nom-acc"]);
      for (let i = 0; i < 400; i++) {
        driftGrammar(g, rng);
        seen.add(g.alignment ?? "nom-acc");
      }
      expect(seen.size, "alignment should visit at least 2 systems in 400 gens").toBeGreaterThanOrEqual(2);
    });

    it("harmony can emerge from 'none'", () => {
      const g = defaultGrammar();
      g.harmony = "none";
      const rng = makeRng("drift-harmony");
      let arrived = false;
      for (let i = 0; i < 1000; i++) {
        driftGrammar(g, rng);
        if (g.harmony && g.harmony !== "none") { arrived = true; break; }
      }
      expect(arrived, "harmony should emerge from none in 1000 gens").toBe(true);
    });

    it("classifier system can flip", () => {
      const g = defaultGrammar();
      g.classifierSystem = false;
      const rng = makeRng("drift-clf");
      let flipped = false;
      for (let i = 0; i < 1000; i++) {
        driftGrammar(g, rng);
        if (g.classifierSystem === true) { flipped = true; break; }
      }
      expect(flipped, "classifier system should flip true in 1000 gens").toBe(true);
    });

    it("evidential marking can emerge", () => {
      const g = defaultGrammar();
      g.evidentialMarking = "none";
      const rng = makeRng("drift-evid");
      let arrived = false;
      for (let i = 0; i < 1000; i++) {
        driftGrammar(g, rng);
        if (g.evidentialMarking && g.evidentialMarking !== "none") { arrived = true; break; }
      }
      expect(arrived, "evidential should emerge from none in 1000 gens").toBe(true);
    });

    it("relative-clause strategy drifts between options", () => {
      const g = defaultGrammar();
      const rng = makeRng("drift-rc");
      const seen = new Set<string>();
      for (let i = 0; i < 500; i++) {
        driftGrammar(g, rng);
        seen.add(g.relativeClauseStrategy ?? "default");
      }
      expect(seen.size, "rc strategy should visit multiple values in 500 gens").toBeGreaterThanOrEqual(2);
    });
  });
});
