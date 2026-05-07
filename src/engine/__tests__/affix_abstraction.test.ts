import { describe, it, expect } from "vitest";
import { parseEnglishAffix, lookupAffixMetaByTag } from "../translator/englishAffixes";
import { selectAffixForCategory } from "../lexicon/affixSelector";
import { attemptMorphologicalSynthesis } from "../lexicon/synthesis";
import { buildInitialState } from "../steps/init";
import { presetEnglish } from "../presets/english";
import type { Language } from "../types";
import type { DerivationalSuffix, DerivationCategory } from "../lexicon/derivation";

/**
 * Phase 49 acceptance tests for language-agnostic word formation.
 *
 * The user's bug report: typing "waterdom" against modern English at
 * gen 0 fell through to the placeholder fallback. The pre-fix root
 * cause: `seedDerivationalSuffixes` randomly seeded a "-dom" entry
 * with `productive: false` BEFORE `seedBoundMorphemes` tried to
 * register the productive English `-dom`; the duplicate-tag guard
 * in init.ts skipped the productive one, leaving "-dom" as a
 * non-productive random affix.
 *
 * The post-fix path: `parseEnglishAffix` recognises "-dom" as
 * `dominionAbstract`, and `selectAffixForCategory` picks the
 * language's productive realisation.
 */

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

function suffixEntry(
  tag: string,
  affix: string[],
  category: DerivationCategory,
  productive = true,
): DerivationalSuffix {
  return {
    affix,
    tag,
    category,
    position: "suffix",
    usageCount: productive ? 5 : 0,
    productive,
  };
}

describe("Phase 49 — parseEnglishAffix", () => {
  it("recognises 'waterdom' as water + -dom (dominionAbstract suffix)", () => {
    const parsed = parseEnglishAffix("waterdom");
    expect(parsed).not.toBeNull();
    expect(parsed!.candidateStems[0]).toBe("water");
    expect(parsed!.category).toBe("dominionAbstract");
    expect(parsed!.position).toBe("suffix");
    expect(parsed!.affixTag).toBe("-dom");
  });

  it("recognises 'lightness' as light + -ness (abstractNoun)", () => {
    const parsed = parseEnglishAffix("lightness");
    expect(parsed).not.toBeNull();
    expect(parsed!.candidateStems[0]).toBe("light");
    expect(parsed!.category).toBe("abstractNoun");
  });

  it("recognises 'unhappy' as un- + happy (negative prefix)", () => {
    const parsed = parseEnglishAffix("unhappy");
    expect(parsed).not.toBeNull();
    expect(parsed!.candidateStems[0]).toBe("happy");
    expect(parsed!.category).toBe("negative");
    expect(parsed!.position).toBe("prefix");
  });

  it("returns null for a lemma with no recognisable affix", () => {
    expect(parseEnglishAffix("rock")).toBeNull();
  });

  it("longest-match: 'kindness' picks -ness over -ess", () => {
    const parsed = parseEnglishAffix("kindness");
    expect(parsed).not.toBeNull();
    expect(parsed!.affixTag).toBe("-ness");
  });

  it("doubled-consonant heuristic: 'runner' yields candidateStems [runner-er=runn, run]", () => {
    const parsed = parseEnglishAffix("runner");
    expect(parsed).not.toBeNull();
    expect(parsed!.candidateStems).toEqual(["runn", "run"]);
  });

  it("rejects stems shorter than 2 chars", () => {
    expect(parseEnglishAffix("ed")).toBeNull();
  });

  it("lookupAffixMetaByTag round-trips known tags", () => {
    expect(lookupAffixMetaByTag("-dom")?.category).toBe("dominionAbstract");
    expect(lookupAffixMetaByTag("un-")?.category).toBe("negative");
    expect(lookupAffixMetaByTag("re-")?.category).toBe("repetitive");
    expect(lookupAffixMetaByTag("-er.agt")?.category).toBe("agentive");
  });
});

describe("Phase 49 — selectAffixForCategory", () => {
  it("picks the only productive realisation when there's one candidate", () => {
    const lang = makeLang({
      derivationalSuffixes: [
        suffixEntry("-ness", ["n", "ə", "s"], "abstractNoun"),
      ],
    });
    const picked = selectAffixForCategory(
      lang, "abstractNoun", ["b", "i", "g"], "suffix",
    );
    expect(picked).not.toBeNull();
    expect(picked!.tag).toBe("-ness");
  });

  it("picks the higher-OT-fit candidate when two compete in the same category", () => {
    // Both candidates are productive abstractNoun suffixes. The first
    // adds a coda cluster ("...gtas" — bad), the second is V-final
    // ("...gke" — better OT fit, no coda).
    const lang = makeLang({
      derivationalSuffixes: [
        suffixEntry("-tas", ["t", "a", "s"], "abstractNoun"),
        suffixEntry("-ke", ["k", "e"], "abstractNoun"),
      ],
    });
    const picked = selectAffixForCategory(
      lang, "abstractNoun", ["b", "i", "g"], "suffix",
    );
    expect(picked).not.toBeNull();
    expect(picked!.tag).toBe("-ke");
  });

  it("returns null when no productive affix exists in the category", () => {
    const lang = makeLang({
      derivationalSuffixes: [
        suffixEntry("-ness", ["n", "ə", "s"], "abstractNoun"),
      ],
    });
    const picked = selectAffixForCategory(
      lang, "agentive", ["l", "a", "j", "t"], "suffix",
    );
    expect(picked).toBeNull();
  });

  it("ignores non-productive candidates", () => {
    const lang = makeLang({
      derivationalSuffixes: [
        suffixEntry("-ness", ["n", "ə", "s"], "abstractNoun", false),
      ],
    });
    const picked = selectAffixForCategory(
      lang, "abstractNoun", ["b", "i", "g"], "suffix",
    );
    expect(picked).toBeNull();
  });
});

describe("Phase 49 — waterdom regression (the user's bug)", () => {
  it("modern English at gen 0 resolves 'waterdom' via category-driven synthesis", () => {
    const cfg = presetEnglish();
    const state = buildInitialState(cfg);
    const rootId = Object.keys(state.tree)[0]!;
    const lang = state.tree[rootId]!.language;

    // Sanity: stem and affix both seeded.
    expect(lang.lexicon.water).toBeDefined();
    const dom = lang.derivationalSuffixes?.find((s) => s.tag === "-dom");
    expect(dom).toBeDefined();
    // The pre-fix bug: -dom was non-productive with random phonemes.
    expect(dom!.productive).toBe(true);
    expect(dom!.affix).toEqual(["d", "ə", "m"]);
    expect(dom!.category).toBe("dominionAbstract");

    const result = attemptMorphologicalSynthesis(lang, "waterdom", "non-neg");
    expect(result).not.toBeNull();
    expect(result!.resolution).toBe("synth-affix");
    expect(result!.glossNote).toBe("water + -dom");
    expect(result!.form).toEqual([...lang.lexicon.water!, "d", "ə", "m"]);
  });

  it("modern English at gen 0 also resolves 'sadness' and 'lightness'", () => {
    const cfg = presetEnglish();
    const state = buildInitialState(cfg);
    const rootId = Object.keys(state.tree)[0]!;
    const lang = state.tree[rootId]!.language;
    for (const lemma of ["sadness", "lightness"]) {
      const r = attemptMorphologicalSynthesis(lang, lemma, "non-neg");
      expect(r, `expected ${lemma} to resolve`).not.toBeNull();
      expect(r!.resolution).toBe("synth-affix");
    }
  });

  it("modern English at gen 0 resolves 'unhappy' via the negational rung", () => {
    const cfg = presetEnglish();
    const state = buildInitialState(cfg);
    const rootId = Object.keys(state.tree)[0]!;
    const lang = state.tree[rootId]!.language;
    // Non-neg rung returns null (un- is negational, partitioned out).
    expect(attemptMorphologicalSynthesis(lang, "unhappy", "non-neg")).toBeNull();
    // Neg rung fires.
    const r = attemptMorphologicalSynthesis(lang, "unhappy", "neg");
    expect(r).not.toBeNull();
    expect(r!.resolution).toBe("synth-neg-affix");
  });
});

describe("Phase 49 — cross-language category abstraction", () => {
  it("a synthetic language whose abstractNoun realisation is '-tas' resolves 'lightness' via light + -tas", () => {
    const lang = makeLang({
      lexicon: { light: ["l", "a", "j", "t"] },
      derivationalSuffixes: [
        suffixEntry("-tas", ["t", "a", "s"], "abstractNoun"),
      ],
    });
    const r = attemptMorphologicalSynthesis(lang, "lightness", "non-neg");
    expect(r).not.toBeNull();
    expect(r!.parts[1]!.meaning).toBe("-tas");
    expect(r!.form).toEqual(["l", "a", "j", "t", "t", "a", "s"]);
  });
});

describe("Phase 49 — back-compat with legacy literal-tag fallback", () => {
  it("a productive affix with no category still resolves via the legacy path when its surface tag matches the lemma", () => {
    const lang = makeLang({
      lexicon: { build: ["b", "ɪ", "l", "d"] },
      // No category field — pre-Phase-49 entry. The category-driven
      // path won't pick it up; the literal-tag fallback will.
      derivationalSuffixes: [{
        affix: ["x", "y"],
        tag: "-fakemorpheme",
        usageCount: 5,
        productive: true,
      }],
    });
    const r = attemptMorphologicalSynthesis(lang, "buildfakemorpheme", "non-neg");
    expect(r).not.toBeNull();
    expect(r!.parts[1]!.meaning).toBe("-fakemorpheme");
  });
});
