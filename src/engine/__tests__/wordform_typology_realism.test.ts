import { describe, it, expect } from "vitest";
import type { Language, Phoneme } from "../types";
import type { DerivationalSuffix } from "../lexicon/derivation";
import { MECHANISM_DERIVATION } from "../genesis/mechanisms/derivation";
import { progressGrammaticalizationChain } from "../morphology/evolve";
import { makeRng } from "../rng";
import { tSet as lexSet } from "../lexicon/__tests__/glossSeam";

/**
 * wordform_typology_realism.test.ts
 *
 * Lane B (realism overhaul) — word-formation follows the language's OWN
 * typology and syllable structure (#1), and the grammaticalisation cline
 * paces with a coherent cadence (#2).
 *
 * See docs/planning/REALISM-OVERHAUL-2026-06.md §5.
 */

function baseLang(affixPosition: "prefix" | "suffix"): Language {
  const lang = {
    id: "L",
    name: "T",
    lexemes: {},
    grammar: { affixPosition, harmony: "none" },
    morphology: { paradigms: {} },
    phonemeInventory: { segmental: [] as Phoneme[], tones: [], usesTones: false },
    wordFrequencyHints: {},
    localNeighbors: {},
    wordOrigin: {},
    derivationalSuffixes: [] as DerivationalSuffix[],
  } as unknown as Language;
  return lang;
}

describe("Lane B #1 — derivation follows the language's affix typology", () => {
  it("a SUFFIXING language derives base + suffix (etymology via -X)", () => {
    const lang = baseLang("suffix");
    lang.derivationalSuffixes = [
      { affix: ["e", "r"], tag: "agt", category: "agentive", usageCount: 5, productive: true, position: "suffix" },
    ] as DerivationalSuffix[];
    lexSet(lang, "build", ["b", "i", "l", "d"] as Phoneme[]);
    const rng = makeRng("deriv-suffix");
    const res = MECHANISM_DERIVATION.tryCoin(lang, "builder", {} as never, rng);
    expect(res).not.toBeNull();
    // suffix order: base then affix.
    expect(res!.form.join("")).toBe("bilder");
    expect(res!.sources?.via).toBe("-er");
    expect(res!.sources?.partMeanings).toEqual(["build"]);
  });

  it("a PREFIXING language derives prefix + base (etymology via X-)", () => {
    const lang = baseLang("prefix");
    // Bantu-style derivational prefix mu- (person class).
    lang.derivationalSuffixes = [
      { affix: ["m", "u"], tag: "person", category: "agentive", usageCount: 5, productive: true, position: "prefix" },
    ] as DerivationalSuffix[];
    lexSet(lang, "teach", ["s", "o", "m", "a"] as Phoneme[]);
    const rng = makeRng("deriv-prefix");
    const res = MECHANISM_DERIVATION.tryCoin(lang, "teacher", {} as never, rng);
    expect(res).not.toBeNull();
    // prefix order: affix then base.
    expect(res!.form.join("")).toBe("musoma");
    expect(res!.sources?.via).toBe("mu-");
  });

  it("refuses to imprint a suffix on a prefixing language with no prefix affix", () => {
    const lang = baseLang("prefix");
    // Only a SUFFIX affix is available — wrong position for this language.
    lang.derivationalSuffixes = [
      { affix: ["e", "r"], tag: "agt", category: "agentive", usageCount: 5, productive: true, position: "suffix" },
    ] as DerivationalSuffix[];
    lexSet(lang, "build", ["b", "i", "l", "d"] as Phoneme[]);
    const rng = makeRng("deriv-mismatch");
    const res = MECHANISM_DERIVATION.tryCoin(lang, "builder", {} as never, rng);
    expect(res).toBeNull();
  });
});

describe("Lane B #1 — new words respect the syllable structure", () => {
  it("derivation rejects a seam that grossly violates a CV-only profile", () => {
    const lang = baseLang("suffix");
    // Hawaiian-style: CV only, strict.
    lang.phonotacticProfile = { maxOnset: 1, maxCoda: 0, maxCluster: 1, strictness: 1 };
    // Consonant-final base + consonant-initial affix → illegal medial cluster.
    lang.derivationalSuffixes = [
      { affix: ["t", "r", "n"], tag: "agt", category: "agentive", usageCount: 5, productive: true, position: "suffix" },
    ] as DerivationalSuffix[];
    lexSet(lang, "walk", ["k", "a", "l", "k"] as Phoneme[]);
    const rng = makeRng("deriv-cv");
    const res = MECHANISM_DERIVATION.tryCoin(lang, "walker", {} as never, rng);
    // /kalk/ + /trn/ → /kalktrn/ — a 4-consonant medial cluster, profile score 0.
    expect(res).toBeNull();
  });

  it("derivation accepts a CV-legal seam under the same strict profile", () => {
    const lang = baseLang("suffix");
    lang.phonotacticProfile = { maxOnset: 1, maxCoda: 0, maxCluster: 1, strictness: 1 };
    lang.derivationalSuffixes = [
      { affix: ["n", "a"], tag: "agt", category: "agentive", usageCount: 5, productive: true, position: "suffix" },
    ] as DerivationalSuffix[];
    lexSet(lang, "see", ["m", "a"] as Phoneme[]);
    const rng = makeRng("deriv-cv-ok");
    const res = MECHANISM_DERIVATION.tryCoin(lang, "seer", {} as never, rng);
    expect(res).not.toBeNull();
    expect(res!.form.join("")).toBe("mana");
  });
});

describe("Lane B #2 — grammaticalisation cline cadence", () => {
  function chainLang(): Language {
    const lang = baseLang("suffix");
    lang.morphology.paradigms["verb.tense.past"] = {
      affix: ["d", "e"] as Phoneme[],
      position: "suffix",
      category: "verb.tense.past",
    };
    lang.grammaticalizationStage = {
      go: {
        stage: 2,
        targetCategory: "verb.tense.past",
        affixForm: ["d", "e"] as Phoneme[],
        lastTransitionGen: 0,
      },
    } as typeof lang.grammaticalizationStage;
    return lang;
  }

  it("a higher cadence multiplier advances the cline more often than baseline", () => {
    // Run the chain many gens with cooldown reset each time; count transitions.
    function countTransitions(mult: number): number {
      let transitions = 0;
      for (let trial = 0; trial < 200; trial++) {
        const lang = chainLang();
        const rng = makeRng(`cadence-${mult}-${trial}`);
        // generation far past the 5-gen cooldown floor.
        const shift = progressGrammaticalizationChain(lang, rng, 100, mult);
        if (shift) transitions++;
      }
      return transitions;
    }
    const slow = countTransitions(0.3); // quiet literate era
    const fast = countTransitions(3.0); // cascade window
    // Cadence rides the multiplier: a cascade fuses/loses far more often.
    expect(fast).toBeGreaterThan(slow);
  });

  it("defaults to the legacy ~4%/gen base when no multiplier is passed", () => {
    // Byte-identity guard: the 3-arg call must behave as if rateMultiplier=1.
    const langA = chainLang();
    const langB = chainLang();
    const a = progressGrammaticalizationChain(langA, makeRng("legacy"), 100);
    const b = progressGrammaticalizationChain(langB, makeRng("legacy"), 100, 1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
