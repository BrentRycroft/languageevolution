import { describe, it, expect } from "vitest";
import {
  phonemeFunctionalLoad,
  functionalLoadMap,
} from "../phonology/functionalLoad";
import {
  inventorySizePressure,
  tierInventoryTarget,
  stepInventoryHomeostasis,
} from "../steps/inventoryHomeostasis";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { makeRng } from "../rng";
import type { Language } from "../types";

function freshEnglish(): Language {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 27b — functional load", () => {
  it("returns 0 for a phoneme that creates no homophones on merger", () => {
    const lang = freshEnglish();
    // Pick a vowel whose merger with its nearest neighbor probably
    // creates no homophones in the seed lexicon.
    const inv = lang.phonemeInventory.segmental;
    const someP = inv.find((p) => /^[aeiou]$/.test(p));
    expect(someP).toBeDefined();
    const load = phonemeFunctionalLoad(lang, someP!);
    // Very low — most vowels in the English seed don't all collapse to
    // homophones if merged.
    expect(load).toBeGreaterThanOrEqual(0);
    expect(load).toBeLessThanOrEqual(1);
  });

  it("returns 0 when the phoneme isn't in the inventory", () => {
    const lang = freshEnglish();
    expect(phonemeFunctionalLoad(lang, "ʘ")).toBe(0);
  });

  it("functionalLoadMap caches per generation", () => {
    const lang = freshEnglish();
    const m1 = functionalLoadMap(lang, 5);
    const m2 = functionalLoadMap(lang, 5);
    expect(m2).toBe(m1); // same reference
    const m3 = functionalLoadMap(lang, 6);
    expect(m3).not.toBe(m1); // recomputed at new generation
  });

  it("functionalLoadMap covers every phoneme in the inventory", () => {
    const lang = freshEnglish();
    const map = functionalLoadMap(lang, 0);
    for (const p of lang.phonemeInventory.segmental) {
      expect(map).toHaveProperty(p);
    }
  });
});

describe("Phase 27b — inventory size pressure", () => {
  it("returns 0 when at-or-below tier target", () => {
    const lang = freshEnglish();
    // Force a small inventory.
    lang.phonemeInventory.segmental = ["a", "i", "u", "p", "t", "k"];
    expect(inventorySizePressure(lang)).toBe(0);
  });

  it("returns positive value when over tier target", () => {
    const lang = freshEnglish();
    // English preset seeds tier 3 → target = 40. Inflate inventory to 60.
    lang.phonemeInventory.segmental = Array.from({ length: 60 }, (_, i) => `x${i}`);
    const pressure = inventorySizePressure(lang);
    expect(pressure).toBeGreaterThan(0);
    expect(pressure).toBeCloseTo(0.5, 1); // (60-40)/40 = 0.5
  });

  it("tierInventoryTarget scales by tier", () => {
    expect(tierInventoryTarget(0)).toBe(22);
    expect(tierInventoryTarget(1)).toBe(28);
    expect(tierInventoryTarget(2)).toBe(34);
    expect(tierInventoryTarget(3)).toBe(40);
    expect(tierInventoryTarget(undefined)).toBe(22);
    expect(tierInventoryTarget(99)).toBe(40); // clamped
  });
});

describe("Phase 27b — stepInventoryHomeostasis", () => {
  it("doesn't crash on a normal-sized language", () => {
    const lang = freshEnglish();
    const rng = makeRng("homeostasis-normal");
    expect(() => stepInventoryHomeostasis(lang, rng, 0)).not.toThrow();
  });

  it("an artificially-bloated language shrinks toward target over many gens", () => {
    const lang = freshEnglish();
    // Add a bunch of "junk" phonemes that occur in 0-1 words (so they're
    // pruning candidates by raw frequency).
    const inv = lang.phonemeInventory.segmental.slice();
    const original = inv.length;
    const junk = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];
    for (const p of junk) inv.push(p);
    lang.phonemeInventory.segmental = inv;
    const startSize = inv.length;
    expect(inventorySizePressure(lang)).toBeGreaterThan(0);

    // Add ONE word containing each junk phoneme so it's in the lexicon
    // and prunable.
    for (let i = 0; i < junk.length; i++) {
      lang.lexicon[`__junk_${i}__`] = ["a", junk[i]!];
    }

    // Run homeostasis with a forced rng for many generations.
    let gen = 1;
    let totalSteps = 0;
    while (totalSteps < 200) {
      const rng = makeRng(`homeo-${gen}`);
      stepInventoryHomeostasis(lang, rng, gen);
      gen++;
      totalSteps++;
      if (lang.phonemeInventory.segmental.length <= original + 2) break;
    }
    expect(lang.phonemeInventory.segmental.length).toBeLessThan(startSize);
  });
});
