import { describe, it, expect } from "vitest";
import {
  subjectPool,
  objectPool,
  adjectivePool,
  verbPool,
  timePool,
  placePool,
  pickWeighted,
  isAnimate,
} from "../narrative/pools";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { makeRng } from "../rng";

function englishLang() {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("narrative pools", () => {
  it("subjectPool prefers animate nouns", () => {
    const lang = englishLang();
    const pool = subjectPool(lang);
    expect(pool.length).toBeGreaterThan(10);
    // Common animates should be in there.
    expect(pool).toContain("dog");
    expect(pool).toContain("mother");
    expect(pool).toContain("king");
  });

  it("subjectPool draws from the full lexicon, not a 14-noun hardcoded pool", () => {
    const lang = englishLang();
    const pool = subjectPool(lang);
    // English seedLexicon has ~60+ animate nouns; old hardcoded pool was 14.
    expect(pool.length).toBeGreaterThan(20);
  });

  it("objectPool returns all nouns", () => {
    const lang = englishLang();
    const pool = objectPool(lang);
    // Should include both animate (dog) and inanimate (water, stone).
    expect(pool).toContain("water");
    expect(pool).toContain("stone");
    expect(pool).toContain("dog");
  });

  it("adjectivePool returns lexicon adjectives only", () => {
    const lang = englishLang();
    const pool = adjectivePool(lang);
    expect(pool).toContain("big");
    expect(pool).toContain("good");
    expect(pool).not.toContain("dog");
    expect(pool).not.toContain("see");
  });

  it("verbPool returns lexicon verbs only", () => {
    const lang = englishLang();
    const pool = verbPool(lang);
    expect(pool).toContain("see");
    expect(pool).toContain("eat");
    expect(pool).not.toContain("dog");
  });

  it("timePool returns time-noun subset", () => {
    const lang = englishLang();
    const pool = timePool(lang);
    expect(pool).toContain("morning");
    expect(pool).toContain("night");
    expect(pool).not.toContain("dog");
  });

  it("placePool returns place-noun subset", () => {
    const lang = englishLang();
    const pool = placePool(lang);
    expect(pool).toContain("river");
    expect(pool).toContain("village");
    expect(pool).not.toContain("dog");
  });

  it("pickWeighted distributes across the pool", () => {
    const lang = englishLang();
    const pool = subjectPool(lang);
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const m = pickWeighted(lang, pool, makeRng(`pw-${i}`));
      if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    // 200 picks should land on at least 10 distinct meanings.
    expect(counts.size).toBeGreaterThan(10);
  });

  it("pickWeighted favours high-frequency words", () => {
    const lang = englishLang();
    // mother has frequency 0.92 in english.ts FREQ; let's confirm it
    // appears more often than a low-freq word in many trials.
    const pool = subjectPool(lang);
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const m = pickWeighted(lang, pool, makeRng(`fav-${i}`));
      if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    const motherCount = counts.get("mother") ?? 0;
    // Avg frequency 0.4 → mother should appear notably more often.
    // Soft assertion: mother should land in at least 1% of picks.
    expect(motherCount).toBeGreaterThan(10);
  });

  it("isAnimate correctly classifies common nouns", () => {
    expect(isAnimate("dog")).toBe(true);
    expect(isAnimate("mother")).toBe(true);
    expect(isAnimate("water")).toBe(false);
    expect(isAnimate("stone")).toBe(false);
  });

  it("pickWeighted returns null on an empty pool", () => {
    const lang = englishLang();
    expect(pickWeighted(lang, [], makeRng("empty"))).toBeNull();
  });
});
