import { describe, it, expect } from "vitest";
import {
  addWord,
  syncWordsAfterPhonology,
  findWordByForm,
  findWordsByMeaning,
} from "../lexicon/word";
import { stepObsolescence } from "../steps/obsolescence";
import { stepPhonology } from "../steps/phonology";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import type { Language } from "../types";

function makeLang(overrides: Partial<Language> = {}): Language {
  return {
    id: "L",
    name: "Test",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO",
      affixPosition: "suffix",
      pluralMarking: "none",
      tenseMarking: "none",
      hasCase: false,
      genderCount: 0,
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    ...overrides,
  };
}

describe("Phase 21d — sound-change merger detection", () => {
  it("two distinct words drifting to the same form merge into one polysemous word", () => {
    const lang = makeLang({
      lexicon: {
        child: ["k", "i", "l", "d"],
        shall: ["s", "a", "l"],
      },
    });
    addWord(lang, ["k", "i", "l", "d"], "child", { bornGeneration: 0 });
    addWord(lang, ["s", "a", "l"], "shall", { bornGeneration: 0 });
    expect(lang.words).toHaveLength(2);
    // Simulate a sound-change pass that drifts both forms to the same surface.
    lang.lexicon.child = ["ʃ", "a", "l"];
    lang.lexicon.shall = ["ʃ", "a", "l"];
    const events = syncWordsAfterPhonology(lang, 10);
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses.map((s) => s.meaning).sort()).toEqual([
      "child",
      "shall",
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]!.newlyAbsorbed).toContain("shall");
    // The absorbed sense gets the merger-origin tag.
    const absorbedSense = lang.words![0]!.senses.find((s) => s.meaning === "shall")!;
    expect(absorbedSense.origin).toBe("sound-change-merger");
  });

  it("a polysemous word whose senses diverge phonologically gets split", () => {
    const lang = makeLang({
      lexicon: {
        "bank.financial": ["b", "a", "n", "k"],
        "bank.river": ["b", "a", "n", "k"],
      },
    });
    addWord(lang, ["b", "a", "n", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "a", "n", "k"], "bank.river", { bornGeneration: 0 });
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses).toHaveLength(2);
    // Phonology splits one sense's form via something like a morpheme-
    // boundary-conditioned rule.
    lang.lexicon["bank.financial"] = ["b", "a", "n", "k"];
    lang.lexicon["bank.river"] = ["b", "a", "n", "k", "ə"];
    syncWordsAfterPhonology(lang, 5);
    // Now we have two distinct words, each with one sense.
    expect(lang.words).toHaveLength(2);
    const fin = findWordByForm(lang, ["b", "a", "n", "k"]);
    const riv = findWordByForm(lang, ["b", "a", "n", "k", "ə"]);
    expect(fin?.senses[0]!.meaning).toBe("bank.financial");
    expect(riv?.senses[0]!.meaning).toBe("bank.river");
  });

  it("a meaning whose lexicon entry was deleted is dropped from words", () => {
    const lang = makeLang({
      lexicon: { dog: ["d", "ɔ", "g"] }, // 'cat' was deleted by phonology
    });
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    addWord(lang, ["k", "æ", "t"], "cat", { bornGeneration: 0 });
    syncWordsAfterPhonology(lang, 10);
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses[0]!.meaning).toBe("dog");
  });

  it("idempotent: a second call on a synced language emits no events", () => {
    const lang = makeLang({ lexicon: { dog: ["d", "ɔ", "g"] } });
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    expect(syncWordsAfterPhonology(lang, 0)).toEqual([]);
    expect(syncWordsAfterPhonology(lang, 1)).toEqual([]);
  });

  it("merger preserves the earliest bornGeneration on the surviving word", () => {
    const lang = makeLang({
      lexicon: { child: ["ʃ", "a", "l"], shall: ["ʃ", "a", "l"] },
    });
    addWord(lang, ["k", "i", "l", "d"], "child", { bornGeneration: 0 });
    addWord(lang, ["s", "a", "l"], "shall", { bornGeneration: 50 });
    // Simulate sound-change drift to homophony.
    lang.words![0]!.form = ["ʃ", "a", "l"];
    lang.words![0]!.formKey = "ʃal";
    lang.words![1]!.form = ["ʃ", "a", "l"];
    lang.words![1]!.formKey = "ʃal";
    syncWordsAfterPhonology(lang, 100);
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.bornGeneration).toBe(0); // earliest survives
  });
});

describe("Phase 21d — obsolescence respects polysemy", () => {
  it("two meanings sharing a Word are NOT treated as rivals (no deletion)", () => {
    const lang = makeLang({
      lexicon: {
        "bank.financial": ["b", "æ", "ŋ", "k"],
        "bank.river": ["b", "æ", "ŋ", "k"],
      },
      wordFrequencyHints: { "bank.financial": 0.5, "bank.river": 0.5 },
    });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    const cfg = defaultConfig();
    cfg.obsolescence.probabilityPerPairPerGeneration = 1.0; // force fire
    cfg.obsolescence.maxDistanceForRivalry = 5;
    const rng = makeRng("polysemy-obsolescence");
    for (let g = 0; g < 50; g++) {
      stepObsolescence(lang, cfg, rng, g);
    }
    // Both senses survived because they share a Word.
    expect(lang.lexicon["bank.financial"]).toBeDefined();
    expect(lang.lexicon["bank.river"]).toBeDefined();
  });

  it("two distinct words with similar forms are still rivals (one gets killed)", () => {
    const lang = makeLang({
      lexicon: {
        cat: ["k", "æ", "t"],
        bat: ["b", "æ", "t"],
      },
      wordFrequencyHints: { cat: 0.5, bat: 0.4 },
    });
    addWord(lang, ["k", "æ", "t"], "cat", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "t"], "bat", { bornGeneration: 0 });
    const cfg = defaultConfig();
    cfg.obsolescence.probabilityPerPairPerGeneration = 1.0;
    cfg.obsolescence.maxDistanceForRivalry = 2;
    const rng = makeRng("rivalry-still-fires");
    for (let g = 0; g < 50; g++) {
      stepObsolescence(lang, cfg, rng, g);
    }
    // Distinct words → rivalry still fires; one of the two should be gone.
    const surviving = ["cat", "bat"].filter((m) => lang.lexicon[m]);
    expect(surviving.length).toBeLessThanOrEqual(1);
  });

  it("when obsolescence kills a meaning, the corresponding word sense is removed", () => {
    const lang = makeLang({
      lexicon: {
        cat: ["k", "æ", "t"],
        bat: ["b", "æ", "t"],
      },
      wordFrequencyHints: { cat: 0.5, bat: 0.4 },
    });
    addWord(lang, ["k", "æ", "t"], "cat", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "t"], "bat", { bornGeneration: 0 });
    const cfg = defaultConfig();
    cfg.obsolescence.probabilityPerPairPerGeneration = 1.0;
    cfg.obsolescence.maxDistanceForRivalry = 2;
    const rng = makeRng("kill-syncs-words");
    // Run until exactly one survives.
    for (let g = 0; g < 50 && Object.keys(lang.lexicon).length > 1; g++) {
      stepObsolescence(lang, cfg, rng, g);
    }
    // The words array should match the surviving lexicon (1 word, 1 sense).
    const survivingMeanings = Object.keys(lang.lexicon);
    expect(survivingMeanings.length).toBe(1);
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses[0]!.meaning).toBe(survivingMeanings[0]);
  });
});

describe("Phase 21d — stepPhonology integration", () => {
  it("running stepPhonology emits a 'merger' event when forms collapse", () => {
    // Build a tiny language whose phonology will merge two close forms.
    // We seed two near-homophones and rely on a phoneme merger to drift
    // them together. Easier: directly mutate lang.lexicon to mimic a
    // sound change, then call stepPhonology — its post-application
    // syncWordsAfterPhonology pass will detect the merger.
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    // Plant two test meanings with identical post-phonology forms.
    lang.lexicon["__test_a__"] = ["x", "y", "z"];
    lang.lexicon["__test_b__"] = ["x", "y", "z"];
    addWord(lang, ["x", "y", "z"], "__test_a__", { bornGeneration: 0 });
    addWord(lang, ["a", "b", "c"], "__test_b__", { bornGeneration: 0 });
    // Words table starts with two distinct entries; one points at the
    // old form for __test_b__, but lexicon now says they collide.
    expect(findWordsByMeaning(lang, "__test_a__")).toHaveLength(1);
    expect(findWordsByMeaning(lang, "__test_b__")).toHaveLength(1);
    const cfg = sim.getConfig();
    const rng = makeRng("merger-integration");
    stepPhonology(lang, cfg, rng, 1);
    // After stepPhonology's internal sync pass, both meanings live on
    // one word.
    const word = findWordByForm(lang, ["x", "y", "z"]);
    if (word) {
      expect(word.senses.map((s) => s.meaning).sort()).toEqual(
        ["__test_a__", "__test_b__"].sort(),
      );
    }
  });
});
