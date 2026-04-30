import { describe, it, expect } from "vitest";
import { applyGeneratedRule } from "../phonology/generated";
import type { GeneratedRule } from "../phonology/generated";
import { applyChangesToLexicon } from "../phonology/apply";
import type { SoundChange } from "../types";
import { makeRng } from "../rng";

describe("minimum-word-length constraint", () => {
  it("never reduces a word to zero phonemes", () => {
    const rule: GeneratedRule = {
      id: "r.total",
      family: "deletion",
      templateId: "deletion.total",
      description: "delete everything",
      from: { type: "vowel" },
      context: { locus: "any" },
      outputMap: { w: "", a: "", t: "", e: "", r: "" },
      birthGeneration: 0,
      lastFireGeneration: 0,
      strength: 1.0,
    };
    const word = ["w", "a", "t", "e", "r"];
    const rng = makeRng("total-kill");
    const next = applyGeneratedRule(rule, word, rng);
    expect(next.length).toBeGreaterThanOrEqual(1);
  });

  it("permits reduction to a single vowel", () => {
    const rule: GeneratedRule = {
      id: "r.cons_kill",
      family: "deletion",
      templateId: "deletion.consonants",
      description: "delete every consonant",
      from: { type: "consonant" },
      context: { locus: "any" },
      outputMap: { k: "", t: "" },
      birthGeneration: 0,
      lastFireGeneration: 0,
      strength: 1.0,
    };
    const word = ["k", "a", "t", "a"];
    const rng = makeRng("cons-kill");
    const next = applyGeneratedRule(rule, word, rng);
    expect(next.length).toBeGreaterThanOrEqual(1);
    expect(next.every((p) => "aeiou".includes(p))).toBe(true);
  });

  it("refuses to reduce a word to a single lone consonant", () => {
    const rule: GeneratedRule = {
      id: "r.everything",
      family: "deletion",
      templateId: "deletion.all",
      description: "delete every segment",
      from: { type: "consonant" },
      context: { locus: "any" },
      outputMap: { b: "", e: "", r: "" },
      birthGeneration: 0,
      lastFireGeneration: 0,
      strength: 1.0,
    };
    const word = ["b", "e", "e", "r"];
    const rng = makeRng("beer-kill");
    const next = applyGeneratedRule(rule, word, rng);
    const isLoneConsonant =
      next.length === 1 && !"aeiou".includes(next[0]!);
    expect(isLoneConsonant).toBe(false);
  });

  it("holds content words to a two-segment floor, but allows pronouns to shrink to a single vowel", () => {
    const total: SoundChange = {
      id: "total-delete",
      label: "delete everything",
      category: "deletion",
      description: "per-segment deletion",
      enabledByDefault: true,
      baseWeight: 1,
      probabilityFor: () => 1,
      apply: (w) => (w.length <= 1 ? w : w.slice(1)),
    };
    const lex = { water: ["w", "a", "t", "e", "r"], i: ["i"] };
    const rng = makeRng("pronoun-exception");
    const next = applyChangesToLexicon(lex, [total], rng, {
      globalRate: 1,
      weights: { "total-delete": 1 },
      frequencyHints: { water: 0.95, i: 0.99 },
    });
    expect(next.water!.length).toBeGreaterThanOrEqual(2);
    expect(next.i!.length).toBe(1);
  });

  it("syllabicity guard reverts a word whose last vowel was stripped", () => {
    const vowelless: SoundChange = {
      id: "kill-vowels",
      label: "delete vowels",
      category: "deletion",
      description: "drop every vowel",
      enabledByDefault: true,
      baseWeight: 1,
      probabilityFor: () => 1,
      apply: (word) =>
        word.filter((p) => !"aeiou".includes(p) && p !== "aː" && p !== "eː"),
    };
    const lex = { water: ["w", "a", "t", "e", "r"] };
    const rng = makeRng("syllabicity");
    const next = applyChangesToLexicon(lex, [vowelless], rng, {
      globalRate: 1,
      weights: { "kill-vowels": 1 },
      frequencyHints: { water: 0.9 },
    });
    const form = next.water!;
    const hasVowel = form.some((p) => "aeiou".includes(p));
    expect(hasVowel).toBe(true);
  });

  it("syllabicity guard accepts a word whose nucleus is a syllabic resonant", () => {
    const noop: SoundChange = {
      id: "noop",
      label: "no-op",
      category: "deletion",
      description: "",
      enabledByDefault: true,
      baseWeight: 1,
      probabilityFor: () => 0,
      apply: (w) => w,
    };
    const lex = { r_word: ["s", "t", "r̩", "k"] };
    const rng = makeRng("syl-resonant");
    const next = applyChangesToLexicon(lex, [noop], rng, {
      globalRate: 1,
      weights: { noop: 1 },
      frequencyHints: { r_word: 0.5 },
    });
    expect(next.r_word).toBeDefined();
    expect(next.r_word!.join("")).toBe("str̩k");
  });

  it("reverts the lower-frequency member when two meanings collide", () => {
    const change: SoundChange = {
      id: "strip-to-r",
      label: "keep only /r/",
      category: "deletion",
      description: "delete everything except /r/",
      enabledByDefault: true,
      baseWeight: 1,
      probabilityFor: () => 1,
      apply: (word) => {
        const keep = word.filter((p) => p === "r");
        return keep.length >= 2 ? keep : word.slice(-2);
      },
    };
    const lex = {
      water: ["w", "a", "t", "e", "r"],
      beer: ["b", "e", "e", "r"],
    };
    const rng = makeRng("anti-homophony");
    const next = applyChangesToLexicon(lex, [change], rng, {
      globalRate: 1,
      weights: { "strip-to-r": 1 },
      frequencyHints: { water: 0.95, beer: 0.3 },
    });
    const forms = [next.water!.join(""), next.beer!.join("")];
    expect(forms[0]).not.toBe(forms[1]);
  });
});
