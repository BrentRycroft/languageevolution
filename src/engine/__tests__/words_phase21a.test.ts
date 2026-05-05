import { describe, it, expect } from "vitest";
import {
  formKeyOf,
  findWordByForm,
  findWordsByMeaning,
  findPrimaryWordForMeaning,
  addWord,
  addSenseToWord,
  removeSense,
  syncLexiconFromWords,
  syncWordsFromLexicon,
} from "../lexicon/word";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { migrateSavedRun, LATEST_SAVE_VERSION } from "../../persistence/migrate";
import { defaultConfig } from "../config";
import type { Language, SavedRun, SimulationState } from "../types";

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

describe("Phase 21a — Word/WordSense data model", () => {
  it("formKeyOf returns the IPA join string", () => {
    expect(formKeyOf(["b", "æ", "ŋ", "k"])).toBe("bæŋk");
    expect(formKeyOf([])).toBe("");
  });

  it("addWord on a fresh form creates a Word with one sense", () => {
    const lang = makeLang();
    const w = addWord(lang, ["k", "æ", "t"], "cat", { bornGeneration: 0 });
    expect(lang.words).toHaveLength(1);
    expect(w.formKey).toBe("kæt");
    expect(w.senses).toHaveLength(1);
    expect(w.senses[0]!.meaning).toBe("cat");
    expect(w.primarySenseIndex).toBe(0);
  });

  it("addWord on an existing form attaches a new sense (homonymy)", () => {
    const lang = makeLang();
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    const w2 = addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", {
      bornGeneration: 5,
      origin: "polysemy",
    });
    expect(lang.words).toHaveLength(1);
    expect(w2.senses).toHaveLength(2);
    expect(w2.senses.map((s) => s.meaning).sort()).toEqual([
      "bank.financial",
      "bank.river",
    ]);
    expect(w2.senses[1]!.origin).toBe("polysemy");
  });

  it("addWord is idempotent: adding the same (form, meaning) twice doesn't duplicate", () => {
    const lang = makeLang();
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 1 });
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses).toHaveLength(1);
  });

  it("addSenseToWord directly attaches a meaning to an existing word", () => {
    const lang = makeLang();
    const w = addWord(lang, ["l", "a", "j", "t"], "light.illumination", {
      bornGeneration: 0,
    });
    addSenseToWord(w, {
      meaning: "light.weight",
      bornGeneration: 10,
      origin: "polysemy",
    });
    expect(w.senses).toHaveLength(2);
  });

  it("findWordByForm and findWordsByMeaning return the right entries", () => {
    const lang = makeLang();
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    expect(findWordByForm(lang, ["b", "æ", "ŋ", "k"])?.senses).toHaveLength(2);
    expect(findWordByForm(lang, ["c", "a", "t"])).toBeUndefined();
    expect(findWordsByMeaning(lang, "bank.financial")).toHaveLength(1);
    expect(findWordsByMeaning(lang, "nonexistent")).toEqual([]);
  });

  it("findPrimaryWordForMeaning returns only the word whose primary sense matches", () => {
    const lang = makeLang();
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    // First sense is the primary (index 0 = bank.financial).
    expect(findPrimaryWordForMeaning(lang, "bank.financial")?.formKey).toBe("bæŋk");
    expect(findPrimaryWordForMeaning(lang, "bank.river")).toBeUndefined();
  });

  it("removeSense strips a meaning; word survives if it had other senses", () => {
    const lang = makeLang();
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    removeSense(lang, "bank.river");
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses).toHaveLength(1);
    expect(lang.words![0]!.senses[0]!.meaning).toBe("bank.financial");
  });

  it("removeSense deletes the word entirely when its last sense is removed", () => {
    const lang = makeLang();
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    removeSense(lang, "dog");
    expect(lang.words).toEqual([]);
  });

  it("removeSense preserves primarySenseIndex pointing at the same meaning", () => {
    const lang = makeLang();
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.bench", { bornGeneration: 0 });
    // Word.senses = [financial, river, bench], primary = 0 (financial).
    // Strip the primary; new primary should fall back to 0 (the first remaining).
    removeSense(lang, "bank.financial");
    expect(lang.words![0]!.senses).toHaveLength(2);
    expect(lang.words![0]!.primarySenseIndex).toBe(0);
    // Strip a non-primary; primary stays attached to the same meaning (river).
    removeSense(lang, "bank.bench");
    expect(lang.words![0]!.senses[0]!.meaning).toBe("bank.river");
    expect(lang.words![0]!.primarySenseIndex).toBe(0);
  });
});

describe("Phase 21a — sync between lexicon and words", () => {
  it("syncLexiconFromWords rebuilds lexicon as the meaning→primary-form view", () => {
    const lang = makeLang();
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    syncLexiconFromWords(lang);
    expect(lang.lexicon["bank.financial"]).toEqual(["b", "æ", "ŋ", "k"]);
    expect(lang.lexicon["bank.river"]).toEqual(["b", "æ", "ŋ", "k"]);
    expect(lang.lexicon["dog"]).toEqual(["d", "ɔ", "g"]);
  });

  it("syncLexiconFromWords populates colexifiedAs for shared-form meanings", () => {
    const lang = makeLang();
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    syncLexiconFromWords(lang);
    expect(lang.colexifiedAs?.["bank.financial"]).toEqual(["bank.river"]);
    expect(lang.colexifiedAs?.["bank.river"]).toEqual(["bank.financial"]);
  });

  it("syncWordsFromLexicon builds words from a meaning-keyed lexicon", () => {
    const lang = makeLang({
      lexicon: {
        cat: ["k", "æ", "t"],
        dog: ["d", "ɔ", "g"],
      },
      wordFrequencyHints: { cat: 0.8, dog: 0.7 },
    });
    syncWordsFromLexicon(lang, 0);
    expect(lang.words).toHaveLength(2);
    const cat = findWordByForm(lang, ["k", "æ", "t"]);
    expect(cat?.senses[0]!.weight).toBe(0.8);
  });

  it("syncWordsFromLexicon merges meanings that share a form into one word", () => {
    const lang = makeLang({
      lexicon: {
        "bank.financial": ["b", "æ", "ŋ", "k"],
        "bank.river": ["b", "æ", "ŋ", "k"],
      },
    });
    syncWordsFromLexicon(lang, 0);
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses).toHaveLength(2);
  });

  it("syncWordsFromLexicon preserves colexification edges from old saves", () => {
    const lang = makeLang({
      lexicon: {
        "bank.financial": ["b", "æ", "ŋ", "k"],
        // pre-21a colexification could record meanings as colexified even
        // when their forms briefly differ; the migrator should fold them
        // into one word.
        "bank.river": ["b", "æ", "ŋ", "k"],
      },
      colexifiedAs: { "bank.financial": ["bank.river"] },
    });
    syncWordsFromLexicon(lang, 0);
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses.map((s) => s.meaning).sort()).toEqual([
      "bank.financial",
      "bank.river",
    ]);
  });

  it("syncWordsFromLexicon is idempotent if words already populated", () => {
    const lang = makeLang({ lexicon: { cat: ["k", "æ", "t"] } });
    syncWordsFromLexicon(lang, 0);
    const ref = lang.words!;
    syncWordsFromLexicon(lang, 5);
    expect(lang.words).toBe(ref); // same reference, untouched
  });
});

describe("Phase 21a — buildInitialState seeds words from lexicon", () => {
  it("a fresh English simulation has lang.words populated from day zero", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    expect(lang.words).toBeDefined();
    expect(lang.words!.length).toBeGreaterThan(0);
    // Every meaning in the seed lexicon should have a corresponding word.
    for (const m of Object.keys(lang.lexicon).slice(0, 10)) {
      const wordsForMeaning = findWordsByMeaning(lang, m);
      expect(wordsForMeaning.length).toBeGreaterThan(0);
    }
  });

  it("daughter languages cloned from parent get their own words array", () => {
    const sim = createSimulation(presetEnglish());
    sim.step(); // triggers proto-split into daughters
    const tree = sim.getState().tree;
    const leaves = Object.values(tree).filter((n) => n.childrenIds.length === 0);
    expect(leaves.length).toBeGreaterThan(0);
    // Each daughter has its own words array (deep cloned, no shared refs
    // with the parent).
    for (const node of leaves) {
      expect(node.language.words).toBeDefined();
      expect(node.language.words!.length).toBeGreaterThan(0);
    }
    if (leaves.length >= 2) {
      expect(leaves[0]!.language.words).not.toBe(leaves[1]!.language.words);
    }
  });
});

describe("Phase 21a — persistence migration v5 → v6", () => {
  it("LATEST_SAVE_VERSION is 8", () => {
    expect(LATEST_SAVE_VERSION).toBe(8);
  });

  it("a v5 save with a stateSnapshot gets words populated post-migration", () => {
    const lang: Language = makeLang({
      lexicon: { cat: ["k", "æ", "t"], dog: ["d", "ɔ", "g"] },
    });
    const snapshot: SimulationState = {
      generation: 0,
      rootId: "L",
      rngState: 0,
      tree: {
        L: { language: lang, parentId: null, childrenIds: [] },
      },
    };
    const v5: Record<string, unknown> = {
      version: 5,
      id: "test",
      label: "test",
      createdAt: 0,
      config: defaultConfig(),
      generationsRun: 0,
      stateSnapshot: snapshot,
    };
    const migrated = migrateSavedRun(v5);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(8);
    const migratedLang =
      migrated!.stateSnapshot!.tree["L"]!.language;
    expect(migratedLang.words).toBeDefined();
    expect(migratedLang.words!.length).toBe(2);
  });

  it("a v5 save with two meanings sharing a form becomes one polysemous word", () => {
    const lang: Language = makeLang({
      lexicon: {
        "bank.financial": ["b", "æ", "ŋ", "k"],
        "bank.river": ["b", "æ", "ŋ", "k"],
      },
    });
    const snapshot: SimulationState = {
      generation: 0,
      rootId: "L",
      rngState: 0,
      tree: {
        L: { language: lang, parentId: null, childrenIds: [] },
      },
    };
    const v5: SavedRun = {
      version: 5 as unknown as 8,
      id: "x",
      label: "x",
      createdAt: 0,
      config: defaultConfig(),
      generationsRun: 0,
      stateSnapshot: snapshot,
    };
    const migrated = migrateSavedRun(v5);
    expect(migrated).not.toBeNull();
    const migratedLang =
      migrated!.stateSnapshot!.tree["L"]!.language;
    expect(migratedLang.words).toHaveLength(1);
    expect(migratedLang.words![0]!.senses).toHaveLength(2);
  });

  it("a v6 save passes through unchanged (no double-migration)", () => {
    const lang: Language = makeLang({
      lexicon: { cat: ["k", "æ", "t"] },
    });
    const snapshot: SimulationState = {
      generation: 0,
      rootId: "L",
      rngState: 0,
      tree: {
        L: { language: lang, parentId: null, childrenIds: [] },
      },
    };
    syncWordsFromLexicon(lang, 0);
    const refWords = lang.words!;
    const v6: SavedRun = {
      version: 6 as unknown as 8,
      id: "y",
      label: "y",
      createdAt: 0,
      config: defaultConfig(),
      generationsRun: 0,
      stateSnapshot: snapshot,
    };
    const migrated = migrateSavedRun(v6);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(8);
    // words array preserved (idempotent guard in syncWordsFromLexicon)
    const migratedLang =
      migrated!.stateSnapshot!.tree["L"]!.language;
    expect(migratedLang.words).toBe(refWords);
  });
});

describe("Phase 21a — backward-compat invariant: lexicon[m] still works", () => {
  it("seeding builds words but lexicon[m] reads remain unchanged", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    expect(lang.lexicon["water"]).toBeDefined();
    expect(lang.lexicon["fire"]).toBeDefined();
    // Same form-content as the seed preset's lexicon — no behavior change.
    expect(lang.lexicon["water"]).toEqual(["w", "ɔ", "t", "ə", "r"]);
  });
});
