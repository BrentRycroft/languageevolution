import { describe, it, expect } from "vitest";
import {
  tryDerivedFormFromMeaning,
  pickRuntimeDerivedMeaning,
} from "../morphology/derivation";
import type { Language, Phoneme } from "../types";
import type { DerivationalSuffix } from "../lexicon/derivation";
import { makeRng } from "../rng";
import { lexSet, lexGet } from "../lexicon/access";

/**
 * runtime_derivation.test.ts
 *
 * Test suite for: "Phase 66 T2 — productive derivation at narrative runtime".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function fakeLang(): Language {
  const lang = {
    lexicon: {},
    derivationalSuffixes: [
      {
        tag: "agt",
        affix: ["ə", "ɹ"] as Phoneme[],
        category: "agentive",
        usageCount: 5,
        productive: true,
        establishedGeneration: 0,
        position: "suffix",
        lastUsedGeneration: 0,
      } as DerivationalSuffix,
      {
        tag: "nmlz",
        affix: ["i", "ŋ"] as Phoneme[],
        category: "nominalisation",
        usageCount: 1,
        productive: false, // not productive
        establishedGeneration: 0,
        position: "suffix",
        lastUsedGeneration: 0,
      } as DerivationalSuffix,
    ],
    grammar: { harmony: "none" },
    phonemeInventory: { segmental: [] as Phoneme[] },
    wordFrequencyHints: {},
  } as unknown as Language;
  lexSet(lang, "see", ["s", "iː"] as Phoneme[]);
  lexSet(lang, "run", ["ɹ", "ʌ", "n"] as Phoneme[]);
  lexSet(lang, "eat", ["iː", "t"] as Phoneme[]);
  lexSet(lang, "dog", ["d", "ɔ", "g"] as Phoneme[]);
  return lang;
}

describe("Phase 66 T2 — productive derivation at narrative runtime", () => {
  it("tryDerivedFormFromMeaning builds a derived form from a known base + productive suffix", () => {
    const lang = fakeLang();
    const form = tryDerivedFormFromMeaning(lang, "see-agt");
    expect(form).toBeDefined();
    expect(form!.join("")).toBe("siːəɹ");
  });

  it("returns null when the base meaning isn't in the lexicon", () => {
    const lang = fakeLang();
    expect(tryDerivedFormFromMeaning(lang, "unknownword-agt")).toBeNull();
  });

  it("returns null when the suffix isn't productive", () => {
    const lang = fakeLang();
    // -nmlz is not productive in the fixture.
    expect(tryDerivedFormFromMeaning(lang, "see-nmlz")).toBeNull();
  });

  it("returns null when the meaning has no dash", () => {
    const lang = fakeLang();
    expect(tryDerivedFormFromMeaning(lang, "see")).toBeNull();
  });

  it("pickRuntimeDerivedMeaning returns a verb→agentive candidate when productive agent exists", () => {
    const lang = fakeLang();
    const rng = makeRng("rt-deriv-pick");
    const result = pickRuntimeDerivedMeaning(lang, rng);
    expect(result).toBeDefined();
    expect(result!.suffixTag).toBe("agt");
    // Base must be a verb (per VERB_HINTS).
    expect(["see", "run", "eat"]).toContain(result!.baseMeaning);
    // Form must be the base + suffix.
    const baseForm = lexGet(lang, result!.baseMeaning)!;
    expect(result!.form.join("")).toBe(baseForm.join("") + "əɹ");
  });

  it("usageCount increments on each runtime derivation", () => {
    const lang = fakeLang();
    const rng = makeRng("rt-deriv-count");
    const before = lang.derivationalSuffixes!.find((s) => s.tag === "agt")!.usageCount ?? 0;
    pickRuntimeDerivedMeaning(lang, rng);
    pickRuntimeDerivedMeaning(lang, rng);
    const after = lang.derivationalSuffixes!.find((s) => s.tag === "agt")!.usageCount ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it("returns null when no productive suffix exists", () => {
    const lang = fakeLang();
    for (const s of lang.derivationalSuffixes ?? []) {
      s.productive = false;
    }
    const rng = makeRng("rt-deriv-none");
    expect(pickRuntimeDerivedMeaning(lang, rng)).toBeNull();
  });
});
