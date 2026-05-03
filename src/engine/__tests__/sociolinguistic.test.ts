import { describe, it, expect } from "vitest";
import { recordInnovation, stepSocialContagion } from "../lexicon/socialContagion";
import { computeBilingualLinks } from "../contact/bilingual";
import { stepLearner } from "../steps/learner";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import { leafIds } from "../tree/split";
import type { Language, Lexicon } from "../types";

function makeLang(overrides: Partial<Language> = {}, lexicon: Lexicon = {}): Language {
  return {
    id: "L-s",
    name: "TestLang",
    lexicon,
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
    phonemeInventory: { segmental: ["p", "t", "k", "a", "e", "i", "o", "u"], tones: [], usesTones: false },
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

describe("agent-based actuation via social contagion", () => {
  it("a fresh innovation starts as the dominant variant (Phase 23: phonology has already actuated the canonical)", () => {
    // Phase 23 fix: recordInnovation is called AFTER the caller has
    // already mutated lang.lexicon[m] to the new form. So at the moment
    // of recording, the new form IS the canonical / dominant variant in
    // the lang's speech community. The previous semantic (innovation
    // starts at 5% adoption) made stepSocialContagion revert virtually
    // every sound change within 2-3 generations — the bug Phase 23
    // diagnosed and fixed.
    const lang = makeLang({}, { water: ["w", "a", "θ"] });
    recordInnovation(lang, "water", ["w", "a", "t"], ["w", "a", "θ"], 0, "phonology");
    const variants = lang.variants?.water ?? [];
    expect(variants.length).toBe(2);
    const newone = variants.find((v) => v.form.join("") === "waθ");
    expect(newone?.adoptionFraction).toBeGreaterThan(0.8);
    const oldone = variants.find((v) => v.form.join("") === "wat");
    expect(oldone?.adoptionFraction).toBeLessThan(0.2);
  });

  it("majority variant grows logistically (S-curve) toward 1.0", () => {
    const lang = makeLang({}, { water: ["w", "a", "t"] });
    recordInnovation(lang, "water", ["w", "a", "t"], ["w", "a", "θ"], 0, "phonology");
    const winning = lang.variants!.water!.find((v) => v.form.join("") === "waθ")!;
    winning.adoptionFraction = 0.65;
    const losing = lang.variants!.water!.find((v) => v.form.join("") === "wat")!;
    losing.adoptionFraction = 0.35;
    const rng = makeRng("contagion-1");
    for (let i = 0; i < 30; i++) stepSocialContagion(lang, i + 1, rng);
    const finalWinning = lang.variants?.water?.find((v) => v.form.join("") === "waθ");
    if (finalWinning) {
      expect(finalWinning.adoptionFraction ?? 0).toBeGreaterThan(0.85);
    } else {
      expect(lang.lexicon.water?.join("")).toBe("waθ");
    }
  });

  it("innovation crossing 50% triggers actuation event", () => {
    const lang = makeLang({}, { water: ["w", "a", "t"] });
    if (!lang.variants) lang.variants = {};
    lang.variants.water = [
      { form: ["w", "a", "t"], weight: 1, bornGeneration: 0, adoptionFraction: 0.4 },
      { form: ["w", "a", "θ"], weight: 1, bornGeneration: 0, adoptionFraction: 0.6 },
    ];
    const rng = makeRng("act-1");
    let actuated = false;
    for (let i = 0; i < 30; i++) {
      const out = stepSocialContagion(lang, i + 5, rng);
      if (out.length > 0) {
        actuated = true;
        break;
      }
    }
    expect(actuated).toBe(true);
    expect(lang.lexicon.water?.join("")).toBe("waθ");
  });
});

describe("bilingual contact computation", () => {
  it("populates bilingualLinks for sister leaves with overlapping geography", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "biling-1" });
    for (let i = 0; i < 30; i++) sim.step();
    const tree = sim.getState().tree;
    const leaves = leafIds(tree).filter((id) => !tree[id]!.language.extinct);
    if (leaves.length < 2) return;
    let anyHadLinks = false;
    for (const id of leaves) {
      const links = computeBilingualLinks(tree[id]!.language, tree);
      if (Object.keys(links).length > 0) {
        anyHadLinks = true;
        for (const fr of Object.values(links)) {
          expect(fr).toBeGreaterThan(0);
          expect(fr).toBeLessThanOrEqual(0.85);
        }
      }
    }
    expect(anyHadLinks, "at least one leaf should have bilingual links to a sister").toBe(true);
  });

  it("languages with no overlap have no bilingual link", () => {
    const langA = makeLang({ id: "A", coords: { x: 0, y: 0 } });
    const langB = makeLang({ id: "B", coords: { x: 5000, y: 5000 } });
    const tree = {
      A: { language: langA, parentId: null, childrenIds: [] },
      B: { language: langB, parentId: null, childrenIds: [] },
    };
    const links = computeBilingualLinks(langA, tree);
    expect(Object.keys(links).length).toBe(0);
  });
});

describe("learner-driven simplification", () => {
  it("learner can drop a marked phoneme from inventory + replace it in lexicon", () => {
    const lang = makeLang(
      {
        phonemeInventory: { segmental: ["p", "t", "k", "y", "i", "a", "u"], tones: [], usesTones: false },
        conservatism: 0.5,
      },
      { tree: ["t", "y", "p"], home: ["h", "y", "m"] },
    );
    const rng = makeRng("learner-1");
    let dropped = false;
    for (let g = 4; g <= 200; g += 4) {
      stepLearner(lang, defaultConfig(), rng, g);
      if (!lang.phonemeInventory.segmental.includes("y")) {
        dropped = true;
        break;
      }
    }
    expect(dropped, "marked phoneme y should be dropped within 200 gens").toBe(true);
    for (const m of Object.keys(lang.lexicon)) {
      expect(lang.lexicon[m]!.includes("y")).toBe(false);
    }
  });

  it("learner respects cadence (skips most generations)", () => {
    const lang = makeLang({}, { water: ["w", "a", "t"] });
    const rng = makeRng("learner-2");
    const beforeEvents = lang.events.length;
    stepLearner(lang, defaultConfig(), rng, 1);
    stepLearner(lang, defaultConfig(), rng, 2);
    stepLearner(lang, defaultConfig(), rng, 3);
    expect(lang.events.length, "no events on non-cadence gens").toBe(beforeEvents);
  });
});
