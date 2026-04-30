import { describe, it, expect } from "vitest";
import { TEMPLATES, TEMPLATES_BY_FAMILY } from "../phonology/templates";
import { makeRng } from "../rng";
import type { Language } from "../types";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { DEFAULT_OT_RANKING } from "../phonology/ot";
import { DEFAULT_RULE_BIAS } from "../phonology/propose";

function lang(inv: string[]): Language {
  return {
    id: "L-0",
    name: "Test",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: inv, tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    ruleBias: { ...DEFAULT_RULE_BIAS },
    registerOf: {},
    orthography: {},
    otRanking: DEFAULT_OT_RANKING.slice(),
    lastChangeGeneration: {},
  };
}

describe("phonology/templates", () => {
  it("catalog is non-empty and every template has a family", () => {
    expect(TEMPLATES.length).toBeGreaterThan(8);
    for (const t of TEMPLATES) expect(t.family).toBeTruthy();
  });

  it("lenition and vowel_shift families are populated", () => {
    expect(TEMPLATES_BY_FAMILY.lenition?.length).toBeGreaterThan(0);
    expect(TEMPLATES_BY_FAMILY.vowel_shift?.length).toBeGreaterThan(0);
  });

  it("templates return null when inventory cannot support them", () => {
    const rng = makeRng("empty");
    const empty = lang([]);
    for (const t of TEMPLATES) {
      const proposal = t.propose(empty, rng);
      expect(proposal).toBeNull();
    }
  });

  it("every proposal for a rich inventory has a non-empty outputMap", () => {
    const rng = makeRng("rich");
    const rich = lang(["p", "t", "k", "b", "d", "g", "a", "e", "i", "o", "u", "s", "n", "m", "h"]);
    let produced = 0;
    for (const t of TEMPLATES) {
      const proposal = t.propose(rich, rng);
      if (!proposal) continue;
      produced++;
      expect(Object.keys(proposal.outputMap).length).toBeGreaterThan(0);
    }
    expect(produced).toBeGreaterThan(5);
  });

  it("a proposal never emits a phoneme outside the IPA feature table", async () => {
    const { PHONE_FEATURES } = await import("../phonology/features");
    const rng = makeRng("outputs");
    const rich = lang(["p", "t", "k", "b", "d", "g", "a", "e", "i", "o", "u", "s", "n", "m", "h"]);
    for (const t of TEMPLATES) {
      const proposal = t.propose(rich, rng);
      if (!proposal) continue;
      for (const output of Object.values(proposal.outputMap)) {
        if (output === "") continue;
        expect(PHONE_FEATURES[output]).toBeDefined();
      }
    }
  });
});
