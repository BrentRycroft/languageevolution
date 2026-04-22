import { describe, it, expect } from "vitest";
import { diffActiveRules, diffOtRankings, diffGrammar } from "../analysis/ruleDiff";
import type { Language } from "../types";
import type { GeneratedRule } from "../phonology/generated";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { DEFAULT_OT_RANKING } from "../phonology/ot";

function mockRule(tpl: string): GeneratedRule {
  return {
    id: `mock.${tpl}`,
    templateId: tpl,
    family: "lenition",
    description: tpl,
    birthGeneration: 0,
    lastFireGeneration: 0,
    strength: 0.5,
    from: { type: "consonant" },
    context: {},
    outputMap: {},
  };
}

function mockLang(id: string, templates: string[], ot?: string[]): Language {
  return {
    id,
    name: id,
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: templates.map(mockRule),
    retiredRules: [],
    orthography: {},
    otRanking: (ot ?? DEFAULT_OT_RANKING).slice(),
    lastChangeGeneration: {},
  };
}

describe("analysis/ruleDiff", () => {
  it("splits rules into unique vs shared buckets", () => {
    const a = mockLang("A", ["x", "y", "z"]);
    const b = mockLang("B", ["y", "z", "w"]);
    const diff = diffActiveRules(a, b);
    expect(diff.onlyInA.map((r) => r.templateId)).toEqual(["x"]);
    expect(diff.onlyInB.map((r) => r.templateId)).toEqual(["w"]);
    expect(diff.both.map((p) => p.template).sort()).toEqual(["y", "z"]);
  });

  it("OT diff flags rank swaps and absent constraints", () => {
    const a = mockLang("A", [], ["*Coda", "Onset", "MaxIO"]);
    const b = mockLang("B", [], ["Onset", "*Coda", "Dep"]);
    const rows = diffOtRankings(a, b);
    const byName = Object.fromEntries(rows.map((r) => [r.constraint, r]));
    expect(byName["*Coda"]).toMatchObject({ aRank: 0, bRank: 1 });
    expect(byName["Onset"]).toMatchObject({ aRank: 1, bRank: 0 });
    expect(byName["MaxIO"]).toMatchObject({ aRank: 2, bRank: null });
    expect(byName["Dep"]).toMatchObject({ aRank: null, bRank: 2 });
  });

  it("grammar diff flags differing feature values", () => {
    const a = mockLang("A", []);
    a.grammar = { ...DEFAULT_GRAMMAR, wordOrder: "SOV" };
    const b = mockLang("B", []);
    b.grammar = { ...DEFAULT_GRAMMAR, wordOrder: "SVO" };
    const rows = diffGrammar(a, b);
    const byFeature = Object.fromEntries(rows.map((r) => [r.feature, r]));
    expect(byFeature.wordOrder.different).toBe(true);
    expect(byFeature.wordOrder.a).toBe("SOV");
    expect(byFeature.wordOrder.b).toBe("SVO");
  });
});
