import { describe, it, expect } from "vitest";
import type { SoundChange, WordForm } from "../types";
import { applyChangesToWord } from "../phonology/apply";
import { makeRng } from "../rng";

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
      return w;
    },
    enabledByDefault: true,
    baseWeight: 1,
  };
  return { rule, probCalls, applyCalls };
}

describe("stress-filter short-circuit in apply.ts", () => {
  it("skips an `unstressed` rule on a monosyllable (no unstressed vowel)", () => {
    const { rule, probCalls } = makeProbeRule("test.unstressed", "unstressed");
    const word: WordForm = ["k", "a", "t"];
    applyChangesToWord(word, [rule], makeRng("seed-1"), {
      globalRate: 1,
      weights: {},
      stressPattern: "penult",
    });
    expect(probCalls).toHaveLength(0);
  });

  it("invokes an `unstressed` rule on a polysyllable", () => {
    const { rule, probCalls } = makeProbeRule("test.unstressed", "unstressed");
    const word: WordForm = ["k", "a", "t", "u", "l"];
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
