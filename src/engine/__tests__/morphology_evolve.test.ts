import { describe, it, expect } from "vitest";
import { applyPhonologyToAffixes, maybeGrammaticalize, maybeMergeParadigms, maybeDropCollapsedParadigm, inflect } from "../morphology/evolve";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { lexSet, lexGet, lexKeys } from "../lexicon/access";
import type { Language } from "../types";

/**
 * morphology_evolve.test.ts
 *
 * Test suite for: "morphology evolution".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function makeLang(): Language {
  const lang: Language = {
    id: "L-0",
    name: "Proto",
    lexicon: {},
    conceptIds: {},
    enabledChangeIds: ["lenition.p_to_f"],
    changeWeights: { "lenition.p_to_f": 1 },
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: { go: 0.9, come: 0.9 },
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: {
      paradigms: {
        "verb.tense.past": {
          affix: ["p", "e", "d"],
          position: "suffix",
          category: "verb.tense.past",
        },
      },
    },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    orthography: {}, otRanking: [], lastChangeGeneration: {},
  };
  lexSet(lang, "go", ["g", "a", "n"]);
  lexSet(lang, "come", ["k", "o", "m"]);
  return lang;
}

describe("morphology evolution", () => {
  it("applyPhonologyToAffixes mutates each paradigm's affix through the given transform", () => {
    const lang = makeLang();
    const rule = CATALOG_BY_ID["lenition.p_to_f"]!;
    const rng = makeRng("morph");
    applyPhonologyToAffixes(lang.morphology, (form) => {
      if (rule.probabilityFor(form) <= 0) return form;
      return rule.apply(form, rng);
    });
    const affix = lang.morphology.paradigms["verb.tense.past"]!.affix;
    expect(affix[0]).toBe("f");
  });

  it("Phase 4b: a fresh word routes through the clitic stage (1) without truncating the lemma", () => {
    const lang = makeLang();
    const before = new Map(lexKeys(lang).map((m) => [m, lexGet(lang, m)!.join("")]));
    const paradigmsBefore = Object.keys(lang.morphology.paradigms).length;
    const rng = makeRng("gram");
    const shift = maybeGrammaticalize(lang, rng, 1);
    expect(shift).not.toBeNull();
    const m = shift!.source!.meaning;
    // 4b: a fresh word becomes a CLITIC first (stage 1) — it does NOT teleport
    // to a bound affix, so no new paradigm appears on this transition.
    expect(lang.grammaticalizationStage?.[m]?.stage).toBe(1);
    expect(Object.keys(lang.morphology.paradigms).length).toBe(paradigmsBefore);
    expect(lang.wordOrigin[m]).toMatch(/^clitic:/);
    expect(lang.grammaticalizationStage?.[m]?.affixForm).toBeDefined();
    // 4c: the free dictionary lemma is INTACT (not slice(0,-1)'d).
    expect(lexGet(lang, m)!.join("")).toBe(before.get(m));
  });

  it("Phase 4b: a clitic binds into a paradigm (stage 2) with a reduced bound affix", () => {
    const lang = makeLang();
    const rng = makeRng("gram-bind");
    let bound: string | null = null;
    for (let i = 0; i < 50 && !bound; i++) {
      maybeGrammaticalize(lang, rng, 1);
      for (const [m, st] of Object.entries(lang.grammaticalizationStage ?? {})) {
        if (st?.stage === 2) { bound = m; break; }
      }
    }
    expect(bound).not.toBeNull();
    const st = lang.grammaticalizationStage![bound!]!;
    const pdm = lang.morphology.paradigms[st.targetCategory!];
    expect(pdm).toBeDefined();
    // The bound affix is the REDUCED allomorph — no longer than the free lemma.
    expect(pdm!.affix.length).toBeLessThanOrEqual(lexGet(lang, bound!)!.length);
  });

  it("paradigm merge collapses identical affixes in same position", () => {
    const lang = makeLang();
    lang.morphology.paradigms["verb.tense.fut"] = {
      affix: ["p", "e", "d"],
      position: "suffix",
      category: "verb.tense.fut",
    };
    const rng = makeRng("merge");
    const shift = maybeMergeParadigms(lang, rng, 1);
    expect(shift).not.toBeNull();
    expect(Object.keys(lang.morphology.paradigms).length).toBe(1);
  });

  it("Phase 4a: drops a paradigm whose affix has eroded to ∅, keeps live ones", () => {
    const lang = makeLang();
    // A collapsed (empty-affix) paradigm — marks nothing, inflect() bails it
    // to bare stem. It must be removable so paradigm count can fall.
    lang.morphology.paradigms["noun.case.acc"] = {
      affix: [],
      position: "suffix",
      category: "noun.case.acc",
    };
    const rng = makeRng("drop");
    const shift = maybeDropCollapsedParadigm(lang, rng, 1);
    expect(shift).not.toBeNull();
    expect(shift?.kind).toBe("affix_erode");
    // The collapsed one is gone; the live verb.tense.past (affix /ped/) stays.
    expect(lang.morphology.paradigms["noun.case.acc"]).toBeUndefined();
    expect(lang.morphology.paradigms["verb.tense.past"]).toBeDefined();
  });

  it("Phase 4a: no collapsed paradigm → no removal (live affixes untouched)", () => {
    const lang = makeLang(); // only verb.tense.past with affix /ped/
    const rng = makeRng("drop2");
    const shift = maybeDropCollapsedParadigm(lang, rng, 1);
    expect(shift).toBeNull();
    expect(Object.keys(lang.morphology.paradigms).length).toBe(1);
  });

  it("inflect appends suffixes and prepends prefixes correctly", () => {
    const paradigm = {
      affix: ["e", "d"],
      position: "suffix" as const,
      category: "verb.tense.past" as const,
    };
    expect(inflect(["w", "a", "l", "k"], paradigm)).toEqual(["w", "a", "l", "k", "e", "d"]);
    const prefixParadigm = {
      affix: ["a"],
      position: "prefix" as const,
      category: "verb.tense.past" as const,
    };
    expect(inflect(["s", "e", "e"], prefixParadigm)).toEqual(["a", "s", "e", "e"]);
  });
});
