import { describe, it, expect } from "vitest";
import type { SoundChange, WordForm } from "../types";
import { applyChangesToWord } from "../phonology/apply";
import { makeRng } from "../rng";

/**
 * Stress-filter integration tests. Rules with `stressFilter: "unstressed"`
 * should only fire on words that contain an unstressed vowel; words
 * with no unstressed positions (e.g. monosyllables) should pass through
 * untouched even if the rule's `probabilityFor` would otherwise return
 * a positive value.
 *
 * The filter check lives in `apply.ts` and short-circuits before the
 * rule's `probabilityFor` callback — confirmed here by spying on the
 * call counts.
 */

function makeProbeRule(
  id: string,
  filter: SoundChange["stressFilter"],
  probeProb = 1.0,
): { rule: SoundChange; probCalls: number[]; applyCalls: number[] } {
  const probCalls: number[] = [];
  const applyCalls: number[] = [];
  const rule: SoundChange = {
    id,
    label: id,
    category: "vowel",
    description: "test",
    stressFilter: filter,
    probabilityFor: (w) => {
      probCalls.push(w.length);
      return probeProb;
    },
    apply: (w) => {
      applyCalls.push(w.length);
      return w; // no-op so we can detect that it was attempted
    },
    enabledByDefault: true,
    baseWeight: 1,
  };
  return { rule, probCalls, applyCalls };
}

describe("stress-filter short-circuit in apply.ts", () => {
  it("skips an `unstressed` rule on a monosyllable (no unstressed vowel)", () => {
    const { rule, probCalls } = makeProbeRule("test.unstressed", "unstressed");
    const word: WordForm = ["k", "a", "t"]; // single stressed vowel
    applyChangesToWord(word, [rule], makeRng("seed-1"), {
      globalRate: 1,
      weights: {},
      stressPattern: "penult",
    });
    expect(probCalls).toHaveLength(0);
  });

  it("invokes an `unstressed` rule on a polysyllable", () => {
    const { rule, probCalls } = makeProbeRule("test.unstressed", "unstressed");
    const word: WordForm = ["k", "a", "t", "u", "l"]; // two vowels: a, u — penult = a stressed, u unstressed
    applyChangesToWord(word, [rule], makeRng("seed-1"), {
      globalRate: 1,
      weights: {},
      stressPattern: "penult",
    });
    expect(probCalls.length).toBeGreaterThan(0);
  });

  it("invokes a `stressed` rule on any word with at least one vowel", () => {
    const { rule, probCalls } = makeProbeRule("test.stressed", "stressed");
    const word: WordForm = ["k", "a", "t"];
    applyChangesToWord(word, [rule], makeRng("seed-1"), {
      globalRate: 1,
      weights: {},
      stressPattern: "penult",
    });
    expect(probCalls.length).toBeGreaterThan(0);
  });

  it("respects an explicit `any` filter (== always invoke)", () => {
    const { rule, probCalls } = makeProbeRule("test.any", "any");
    const word: WordForm = ["k", "a", "t"];
    applyChangesToWord(word, [rule], makeRng("seed-1"), {
      globalRate: 1,
      weights: {},
      stressPattern: "penult",
    });
    expect(probCalls.length).toBeGreaterThan(0);
  });

  it("treats a missing filter as `any`", () => {
    const { rule, probCalls } = makeProbeRule("test.default", undefined);
    const word: WordForm = ["k", "a", "t"];
    applyChangesToWord(word, [rule], makeRng("seed-1"), {
      globalRate: 1,
      weights: {},
      stressPattern: "penult",
    });
    expect(probCalls.length).toBeGreaterThan(0);
  });

  it("respects `lexicalStress` overrides — rule fires when override re-locates stress", () => {
    // /a.u.i/ — three vowels. With `lexical` + override picking vowel 0,
    // the unstressed positions are vowel 1 (u) and vowel 2 (i).
    const { rule, probCalls } = makeProbeRule("test.unstressed", "unstressed");
    const word: WordForm = ["a", "p", "u", "t", "i"];
    applyChangesToWord(word, [rule], makeRng("seed-1"), {
      globalRate: 1,
      weights: {},
      stressPattern: "lexical",
      lexicalStress: { TARGET: 0 },
    }, "TARGET");
    expect(probCalls.length).toBeGreaterThan(0);
  });

  it("skips when the lexical override leaves no candidate positions", () => {
    // /a/ — a single-vowel word; under any stress pattern, the only
    // vowel is stressed → unstressed filter has no matches.
    const { rule, probCalls } = makeProbeRule("test.unstressed", "unstressed");
    const word: WordForm = ["a"];
    applyChangesToWord(word, [rule], makeRng("seed-1"), {
      globalRate: 1,
      weights: {},
      stressPattern: "lexical",
      lexicalStress: { SOLO: 0 },
    }, "SOLO");
    expect(probCalls).toHaveLength(0);
  });
});
