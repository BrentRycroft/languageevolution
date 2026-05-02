import { describe, it, expect } from "vitest";
import {
  addWord,
  tryCommitCoinage,
  areMeaningsRelated,
  findWordByForm,
} from "../lexicon/word";
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

describe("Phase 21c — areMeaningsRelated", () => {
  it("returns true for the same meaning", () => {
    const lang = makeLang();
    expect(areMeaningsRelated(lang, "dog", "dog")).toBe(true);
  });

  it("returns true when one is a semantic neighbor of the other", () => {
    const lang = makeLang();
    // From SEMANTIC_NEIGHBORS, "river" and "water" are typically linked.
    // We can verify symmetry without depending on a specific entry by
    // also planting a localNeighbors edge below.
    lang.localNeighbors["dog"] = ["wolf"];
    expect(areMeaningsRelated(lang, "dog", "wolf")).toBe(true);
    expect(areMeaningsRelated(lang, "wolf", "dog")).toBe(true);
  });

  it("returns false for two unrelated novel meanings", () => {
    const lang = makeLang();
    expect(areMeaningsRelated(lang, "__alpha__", "__beta__")).toBe(false);
  });
});

describe("Phase 21c — tryCommitCoinage", () => {
  it("creates a fresh Word when the form doesn't exist yet", () => {
    const lang = makeLang();
    const rng = makeRng("commit-fresh");
    const r = tryCommitCoinage(lang, "dog", ["d", "ɔ", "g"], rng, {
      bornGeneration: 0,
    });
    expect(r.committed).toBe(true);
    expect(r.viaPolysemy).toBe(false);
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses[0]!.meaning).toBe("dog");
  });

  it("attaches as polysemy with high probability when the existing sense is related", () => {
    let attached = 0;
    let rejected = 0;
    const TRIALS = 50;
    for (let i = 0; i < TRIALS; i++) {
      const lang = makeLang({
        localNeighbors: { wolf: ["dog"] },
      });
      addWord(lang, ["b", "a", "n", "k"], "wolf", { bornGeneration: 0 });
      const rng = makeRng(`commit-related-${i}`);
      const r = tryCommitCoinage(lang, "dog", ["b", "a", "n", "k"], rng, {
        bornGeneration: 1,
        polysemyProbRelated: 0.4,
        polysemyProbUnrelated: 0.05,
      });
      if (r.committed) attached++;
      else rejected++;
    }
    // 0.4 expected; assert that we get clearly more than the unrelated 0.05 baseline.
    expect(attached).toBeGreaterThan(TRIALS * 0.2);
    expect(attached).toBeLessThan(TRIALS * 0.7);
    expect(rejected).toBeGreaterThan(TRIALS * 0.3);
  });

  it("rarely attaches as polysemy for unrelated meanings", () => {
    let attached = 0;
    const TRIALS = 100;
    for (let i = 0; i < TRIALS; i++) {
      const lang = makeLang();
      addWord(lang, ["x", "y", "z"], "__totally_unrelated_a__", {
        bornGeneration: 0,
      });
      const rng = makeRng(`commit-unrelated-${i}`);
      const r = tryCommitCoinage(
        lang,
        "__totally_unrelated_b__",
        ["x", "y", "z"],
        rng,
        {
          bornGeneration: 1,
          polysemyProbRelated: 0.4,
          polysemyProbUnrelated: 0.05,
        },
      );
      if (r.committed) attached++;
    }
    // 0.05 expected; allow 0–15% range.
    expect(attached).toBeLessThan(TRIALS * 0.15);
  });

  it("idempotent: re-committing an existing (form, meaning) returns committed: true with no duplication", () => {
    const lang = makeLang();
    const rng = makeRng("commit-idem");
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    const r = tryCommitCoinage(lang, "dog", ["d", "ɔ", "g"], rng, {
      bornGeneration: 5,
    });
    expect(r.committed).toBe(true);
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses).toHaveLength(1);
  });

  it("attaches with viaPolysemy=true when polysemy fires", () => {
    const lang = makeLang({ localNeighbors: { wolf: ["dog"] } });
    addWord(lang, ["b", "a", "n", "k"], "wolf", { bornGeneration: 0 });
    // Force polysemy to fire by making probability 1.0.
    const rng = makeRng("force-polysemy");
    const r = tryCommitCoinage(lang, "dog", ["b", "a", "n", "k"], rng, {
      bornGeneration: 1,
      polysemyProbRelated: 1.0,
      polysemyProbUnrelated: 1.0,
    });
    expect(r.committed).toBe(true);
    expect(r.viaPolysemy).toBe(true);
    expect(lang.words).toHaveLength(1);
    expect(lang.words![0]!.senses).toHaveLength(2);
    // The polysemously-attached sense gets origin "polysemy" by default.
    const dogSense = lang.words![0]!.senses.find((s) => s.meaning === "dog")!;
    expect(dogSense.origin).toBe("polysemy");
  });

  it("respects an explicit origin override on the attached sense", () => {
    const lang = makeLang({ localNeighbors: { wolf: ["dog"] } });
    addWord(lang, ["b", "a", "n", "k"], "wolf", { bornGeneration: 0 });
    const rng = makeRng("origin-override");
    tryCommitCoinage(lang, "dog", ["b", "a", "n", "k"], rng, {
      bornGeneration: 1,
      polysemyProbRelated: 1.0,
      origin: "borrow",
    });
    const dogSense = lang.words![0]!.senses.find((s) => s.meaning === "dog")!;
    expect(dogSense.origin).toBe("borrow");
  });

  it("rejection on unrelated collision leaves the existing word untouched", () => {
    const lang = makeLang();
    const w = addWord(lang, ["x", "y"], "alpha", { bornGeneration: 0 });
    const before = w.senses.length;
    const rng = makeRng("reject-unrelated");
    // Force rejection via 0 probability.
    const r = tryCommitCoinage(lang, "beta", ["x", "y"], rng, {
      bornGeneration: 1,
      polysemyProbUnrelated: 0,
    });
    expect(r.committed).toBe(false);
    expect(lang.words![0]!.senses).toHaveLength(before);
  });
});

describe("Phase 21c — integration with stepGenesis", () => {
  it("a genesis coinage that homophones an existing word can attach as polysemy", () => {
    // Constructed scenario: plant a word on a fixed form, then let the
    // genesis writer commit a related-meaning coinage for the same form
    // with polysemy probability forced to 1. The lang.words table
    // should end up with one word, two senses.
    const lang = makeLang({
      lexicon: { wolf: ["b", "a", "n", "k"] },
      localNeighbors: { wolf: ["dog"] },
    });
    addWord(lang, ["b", "a", "n", "k"], "wolf", { bornGeneration: 0 });
    // Direct call of the underlying primitive — we're not testing the
    // full stepGenesis loop here, just the commit policy with related
    // meanings forced.
    const rng = makeRng("genesis-polysemy");
    const result = tryCommitCoinage(lang, "dog", ["b", "a", "n", "k"], rng, {
      bornGeneration: 5,
      polysemyProbRelated: 1.0,
      origin: "compound",
    });
    expect(result.committed).toBe(true);
    expect(result.viaPolysemy).toBe(true);
    const w = findWordByForm(lang, ["b", "a", "n", "k"]);
    expect(w?.senses.map((s) => s.meaning).sort()).toEqual(["dog", "wolf"]);
  });
});
