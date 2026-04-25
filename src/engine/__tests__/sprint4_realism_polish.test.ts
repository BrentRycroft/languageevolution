import { describe, expect, it } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { stepContact } from "../steps/contact";
import { makeRng } from "../rng";
import { TEMPLATES } from "../phonology/templates";
import { PATHWAYS, SEMANTIC_TAG } from "../semantics/grammaticalization";
import type { Language, SimulationState } from "../types";

function bareLang(id: string, overrides: Partial<Language> = {}): Language {
  return {
    id,
    name: id,
    lexicon: { water: ["w", "a"], fire: ["f", "i"] },
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { wordOrder: "SVO", affixPosition: "suffix", pluralMarking: "none", tenseMarking: "none", hasCase: false, genderCount: 0 },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: ["w", "a", "f", "i"], tones: [], usesTones: false },
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

describe("§H.6 — substrate simplification phase", () => {
  it("triggers an accelerated-simplification phase after enough loans pile up", () => {
    // Run a full sim with high borrow rate so loans accumulate fast.
    const sim = createSimulation({
      ...defaultConfig(),
      seed: "substrate-trigger",
      contact: { borrowProbabilityPerGeneration: 0.5 },
    });
    for (let i = 0; i < 250; i++) sim.step();
    const state = sim.getState();
    let triggered = false;
    for (const id of Object.keys(state.tree)) {
      const lang = state.tree[id]!.language;
      for (const e of lang.events) {
        if (e.kind === "grammar_shift" && e.description.startsWith("substrate-simplification phase")) {
          triggered = true;
          break;
        }
      }
      if (triggered) break;
    }
    expect(triggered).toBe(true);
  });

  it("recentLoanGens window is trimmed each step", () => {
    const lang = bareLang("L", { recentLoanGens: [0, 5, 10, 100] });
    const tree = { [lang.id]: { language: lang, parentId: null, childrenIds: [] } };
    const state: SimulationState = { generation: 200, rootId: lang.id, rngState: 0, tree };
    const rng = makeRng("trim");
    stepContact(state, lang, defaultConfig(), rng, 200);
    // All four entries are > 50 gens stale at gen 200.
    expect(lang.recentLoanGens).toEqual([]);
  });
});

describe("§H.3 — glottalization templates", () => {
  it("registers preglottal-final-stop, initial-ejective, and debuccal-glottal templates", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain("fortition.preglottal_final_stop");
    expect(ids).toContain("fortition.initial_ejective");
    expect(ids).toContain("lenition.glottal_debuccalisation");
  });

  it("preglottal-final-stop proposes only when /p t k/ are in the inventory", () => {
    const tpl = TEMPLATES.find((t) => t.id === "fortition.preglottal_final_stop")!;
    const noStops = bareLang("nostop", {
      phonemeInventory: { segmental: ["a", "i"], tones: [], usesTones: false },
    });
    expect(tpl.propose(noStops, makeRng("a"))).toBeNull();
    const withT = bareLang("witht", {
      phonemeInventory: { segmental: ["t", "a"], tones: [], usesTones: false },
    });
    const proposal = tpl.propose(withT, makeRng("b"));
    expect(proposal).not.toBeNull();
    expect(proposal?.outputMap.t).toBe("ʔt");
  });
});

describe("§H.7 — discourse-particle grammaticalisation pathways", () => {
  it("interrogative pronouns map to discourse.q", () => {
    expect(PATHWAYS.interrogative).toContain("discourse.q");
    expect(SEMANTIC_TAG.who).toBe("interrogative");
    expect(SEMANTIC_TAG.what).toBe("interrogative");
  });

  it("topic-noun sources map to discourse.topic", () => {
    expect(PATHWAYS.topic_noun).toContain("discourse.topic");
    expect(SEMANTIC_TAG.name).toBe("topic_noun");
    expect(SEMANTIC_TAG.word).toBe("topic_noun");
  });

  it("emphasis source maps to discourse.emph", () => {
    expect(PATHWAYS.emphasis).toContain("discourse.emph");
    expect(SEMANTIC_TAG.truth).toBe("emphasis");
  });
});

describe("§H.2 — per-tier genesis bias", () => {
  it("default sim with tier 0 still coins via reduplication / ideophone occasionally", () => {
    // The bias multiplies in alongside the existing weights; we just
    // check that the sim doesn't stall on tier-biased mechanisms.
    const sim = createSimulation({ ...defaultConfig(), seed: "tier-bias" });
    for (let i = 0; i < 100; i++) sim.step();
    const state = sim.getState();
    let coinages = 0;
    for (const id of Object.keys(state.tree)) {
      for (const e of state.tree[id]!.language.events) {
        if (e.kind === "coinage") coinages++;
      }
    }
    expect(coinages).toBeGreaterThan(0);
  });
});

describe("§H.4 — inventoryProvenance bookkeeping", () => {
  it("init seeds every phoneme as native", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "provenance" });
    sim.step(); // boot + first split
    const state = sim.getState();
    const proto = state.tree["L-0"]!.language;
    for (const p of proto.phonemeInventory.segmental) {
      expect(proto.inventoryProvenance?.[p]?.source).toBe("native");
    }
  });
});
