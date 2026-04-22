import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { maybeTabooReplace } from "../lexicon/taboo";
import { clusterOf, relatedMeanings } from "../semantics/clusters";
import { isExpressive } from "../lexicon/expressive";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import type { Language } from "../types";

describe("semantic clusters", () => {
  it("core body meanings cluster together", () => {
    expect(clusterOf("hand")).toBe("body");
    expect(clusterOf("foot")).toBe("body");
    expect(clusterOf("water")).toBe("environment");
    expect(clusterOf("go")).toBe("motion");
  });

  it("relatedMeanings returns cluster-mates for seed meanings", () => {
    const related = relatedMeanings("water");
    expect(related.length).toBeGreaterThan(0);
    // Expected cluster-mates are in 'environment': fire, stone, tree, sun, moon, star, night.
    expect(related).toContain("fire");
  });

  it("unknown meanings get empty result (no crash)", () => {
    expect(relatedMeanings("unknown-word")).toEqual([]);
  });
});

describe("expressive phonology", () => {
  it("reduplicated intensifier forms are tagged expressive", () => {
    expect(isExpressive("big-intens")).toBe(true);
  });

  it("ordinary lexicon words are not expressive", () => {
    expect(isExpressive("water")).toBe(false);
    expect(isExpressive("hand")).toBe(false);
  });
});

describe("taboo replacement", () => {
  function makeLang(overrides: Partial<Language> = {}): Language {
    return {
      id: "L-0",
      name: "Proto",
      lexicon: {
        mother: ["m", "a", "m", "a"],
        father: ["t", "a", "t", "a"],
        hand: ["m", "a", "n", "u"],
        foot: ["p", "e", "d"],
      },
      enabledChangeIds: [],
      changeWeights: {},
      birthGeneration: 0,
      grammar: { ...DEFAULT_GRAMMAR },
      events: [],
      wordFrequencyHints: { mother: 0.95, father: 0.95, hand: 0.9, foot: 0.9 },
      phonemeInventory: { segmental: [], tones: [], usesTones: false },
      morphology: { paradigms: {} },
      localNeighbors: {},
      conservatism: 1,
      wordOrigin: {},
      customRules: [],
      orthography: {}, otRanking: [], lastChangeGeneration: {},
      ...overrides,
    };
  }

  it("does nothing when probability is 0", () => {
    const lang = makeLang();
    const rng = makeRng("off");
    const ev = maybeTabooReplace(lang, rng, 0);
    expect(ev).toBeNull();
  });

  it("replaces a high-frequency form and tags origin as taboo", () => {
    const lang = makeLang();
    const rng = makeRng("force");
    const before = Object.keys(lang.lexicon).length;
    const ev = maybeTabooReplace(lang, rng, 1);
    expect(ev).not.toBeNull();
    if (!ev) return;
    expect(Object.keys(lang.lexicon).length).toBe(before);
    expect(lang.lexicon[ev.meaning]!.join("")).not.toBe(ev.oldForm);
    expect(lang.wordOrigin[ev.meaning]).toMatch(/^taboo:/);
  });

  it("tagged meanings keep a new form shorter than 10 phonemes", () => {
    const lang = makeLang();
    const rng = makeRng("length");
    const ev = maybeTabooReplace(lang, rng, 1);
    if (ev) {
      expect(lang.lexicon[ev.meaning]!.length).toBeLessThanOrEqual(9);
    }
  });
});

describe("simulation end-to-end with clusters + taboo + expressive", () => {
  it("produces at least one taboo event in 600 generations", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "taboo-probe" });
    for (let i = 0; i < 600; i++) sim.step();
    const events = Object.values(sim.getState().tree).flatMap(
      (n) => n.language.events,
    );
    const tabooEvents = events.filter((e) => e.description.startsWith("taboo:"));
    // Probability 0.004/gen × 600 gens × several leaves ≈ multiple occurrences.
    expect(tabooEvents.length).toBeGreaterThan(0);
  });
});
