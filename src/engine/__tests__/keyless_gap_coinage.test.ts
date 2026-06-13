import { describe, it, expect } from "vitest";
import { coinKeylessForGap, type SemanticGap } from "../genesis/semanticGap";
import { composeForGap } from "../semantics/gapComposition";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { meaningPointFor } from "../semantics/meaningPoint";
import { tGlosses as lexKeys } from "../lexicon/__tests__/glossSeam";
import { keylessRecords } from "../lexicon/store";
import { satGet } from "../lexicon/satellites";
import { stepPhonology } from "../steps/phonology";
import { coinKeylessLexeme } from "../lexicon/lexemeIdentity";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { makeRng } from "../rng";
import type { Language } from "../types";

function rootLang(): Language {
  const s = createSimulation(presetEnglish()).getState();
  return s.tree[s.rootId]!.language;
}

describe("coinKeylessForGap — keyless gap-coinage path", () => {
  // "whale" composes from animal roots (confirmed by gapComposition.test.ts)
  const C = "whale";

  it("success: returns a non-null id and stores the composed form + point", () => {
    const lang = rootLang();
    // Verify the concept composes (documents the test's precondition)
    const composed = composeForGap(lang, C);
    expect(composed).not.toBeNull();

    const gap: SemanticGap = {
      point: meaningPointFor(lang, C),
      gloss: C,
      nearestExistingDistSq: 1_000_000_000,
      neighborSupport: 5,
    };

    const id = coinKeylessForGap(lang, gap);
    expect(id).not.toBeNull();

    const entry = lang.lexemes[id!];
    expect(entry).toBeDefined();
    // form must equal what composeForGap produces
    expect(entry!.form).toEqual(composed!.form);
    // point must equal Array.from(gap.point)
    expect(entry!.point).toEqual(Array.from(gap.point));
  });

  it("no gloss-key leak: coinage adds a gloss-less record but never mints a gloss anchor", () => {
    const lang = rootLang();
    const gap: SemanticGap = {
      point: meaningPointFor(lang, C),
      gloss: C,
      nearestExistingDistSq: 1_000_000_000,
      neighborSupport: 5,
    };

    const seededBefore = lexKeys(lang).length;
    const lexemeIdKeysBefore = Object.keys(lang.lexemeIds ?? {}).length;

    const id = coinKeylessForGap(lang, gap);

    expect(id).not.toBeNull();
    expect(lang.lexemes[id!]!.gloss).toBeUndefined(); // stored gloss-less (keyless)
    expect(lexKeys(lang).length).toBe(seededBefore); // no new seeded gloss
    expect(Object.keys(lang.lexemeIds ?? {}).length).toBe(lexemeIdKeysBefore); // no gloss anchor minted
  });

  it("failure → null: returns null and does NOT grow the keyless record set when gloss can't compose", () => {
    const lang = rootLang();
    const badGloss = "zzqqxv-not-a-concept";
    // Confirm composeForGap returns null for this gloss (documents the precondition)
    expect(composeForGap(lang, badGloss)).toBeNull();

    const gap: SemanticGap = {
      point: meaningPointFor(lang, C), // borrow a valid point; gloss is what matters for compose
      gloss: badGloss,
      nearestExistingDistSq: 1_000_000_000,
      neighborSupport: 5,
    };

    const sizeBefore = keylessRecords(lang.lexemes).length;
    const result = coinKeylessForGap(lang, gap);
    expect(result).toBeNull();
    expect(keylessRecords(lang.lexemes).length).toBe(sizeBefore);
  });

  it("determinism: two identical languages + same gap produce the same id and stored entry", () => {
    const lang1 = rootLang();
    const lang2 = rootLang();

    const makeGap = (lang: Language): SemanticGap => ({
      point: meaningPointFor(lang, C),
      gloss: C,
      nearestExistingDistSq: 1_000_000_000,
      neighborSupport: 5,
    });

    const id1 = coinKeylessForGap(lang1, makeGap(lang1));
    const id2 = coinKeylessForGap(lang2, makeGap(lang2));

    expect(id1).not.toBeNull();
    expect(id2).not.toBeNull();
    expect(id1).toBe(id2);
    expect(lang1.lexemes[id1!]!.form).toEqual(lang2.lexemes[id2!]!.form);
    expect(lang1.lexemes[id1!]!.point).toEqual(lang2.lexemes[id2!]!.point);
  });
});

describe("keyless birth-time satellite population (S2a task 15)", () => {
  it("a coined keyless word gets frequency / age / origin / register under its id", () => {
    const lang = rootLang();
    const gap: SemanticGap = {
      point: meaningPointFor(lang, "whale"),
      gloss: "whale",
      nearestExistingDistSq: 1_000_000_000,
      neighborSupport: 5,
    };
    const id = coinKeylessForGap(lang, gap, 12);
    expect(id).not.toBeNull();
    expect(satGet(lang, "wordFrequencyHints", id!)).toBe(0.4);
    expect(satGet(lang, "lastChangeGeneration", id!)).toBe(12);
    expect(satGet(lang, "wordOrigin", id!)).toBe("keyless-gap");
    expect(satGet(lang, "registerOf", id!)).toBe("low");
  });
});

describe("keyless words are first-class in the sound-change sweep (S1 task 4 lock)", () => {
  it("a coined keyless word's form changes under sound change over 30 gens, deterministically", () => {
    const run = () => {
      const config = presetEnglish();
      const sim = createSimulation(config);
      const lang = sim.getState().tree[sim.getState().rootId]!.language;
      const id = coinKeylessLexeme(lang, fromFloats(embed("fire")), ["k", "a", "t", "a", "p", "u", "l", "t", "a", "s"]);
      const before = lang.lexemes[id]!.form.join("");
      const rng = makeRng("keyless-evolve-lock");
      for (let g = 1; g <= 30; g++) stepPhonology(lang, config, rng, g);
      return { before, after: lang.lexemes[id]!.form.join("") };
    };
    const a = run();
    expect(a.after).not.toBe(a.before); // it evolved (was inert before task 4)
    // determinism: a second identical run yields the identical evolved form
    expect(run().after).toBe(a.after);
  });
});
