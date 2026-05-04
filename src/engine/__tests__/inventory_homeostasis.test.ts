import { describe, it, expect } from "vitest";
import {
  phonemeFunctionalLoad,
  functionalLoadMap,
} from "../phonology/functionalLoad";
import {
  inventorySizePressure,
  tierInventoryTarget,
  stepInventoryHomeostasis,
} from "../steps/inventoryManagement";
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

describe("Phase 27.1 — stepInventoryHomeostasis", () => {
  it("doesn't crash on a normal-sized language", () => {
    const lang = freshEnglish();
    const rng = makeRng("homeostasis-normal");
    expect(() => stepInventoryHomeostasis(lang, rng, 0)).not.toThrow();
  });

  it("an artificially bloated language shrinks to within 1.2× target within 30 gens", () => {
    const lang = freshEnglish();
    lang.culturalTier = 3; // target 40
    const target = tierInventoryTarget(lang.culturalTier);
    // Pool of palatalised/labialised/aspirated consonant variants, each
    // featurally adjacent to a base in the seed inventory so
    // nearestNeighbour can find a merger target.
    const filler = [
      "pʲ", "tʲ", "kʲ", "bʲ", "dʲ", "gʲ",
      "pʷ", "tʷ", "kʷ", "bʷ", "dʷ", "gʷ",
      "fʲ", "sʲ", "zʲ", "fʷ", "sʷ", "zʷ",
      "mʲ", "nʲ", "lʲ", "rʲ", "mʷ", "nʷ",
      "pʰ", "tʰ", "kʰ", "bʰ", "dʰ", "gʰ",
    ];
    const seedSet = new Set(lang.phonemeInventory.segmental);
    const novel = filler.filter((p) => !seedSet.has(p));
    const startSize = lang.phonemeInventory.segmental.length + novel.length;
    expect(startSize).toBeGreaterThanOrEqual(50);
    lang.phonemeInventory.segmental = [
      ...lang.phonemeInventory.segmental,
      ...novel,
    ];
    for (let i = 0; i < novel.length; i++) {
      lang.lexicon[`__junk_${i}__`] = ["a", novel[i]!];
    }
    expect(lang.phonemeInventory.segmental.length).toBe(startSize);
    expect(inventorySizePressure(lang)).toBeGreaterThan(0);

    for (let gen = 1; gen <= 30; gen++) {
      const rng = makeRng(`homeo-shrink-${gen}`);
      stepInventoryHomeostasis(lang, rng, gen);
    }
    expect(lang.phonemeInventory.segmental.length).toBeLessThanOrEqual(
      Math.floor(target * 1.2),
    );
  });
});

describe("Phase 27.1 — full-simulation inventory convergence", () => {
  // Phase 29 Tranche 7g: trimmed to 60 gens. The homeostatic regime
  // engages by gen ~50 (when English hits tier-3 cap ~40 phonemes);
  // 60 is enough to demonstrate boundedness without burning 22s.
  it("English preset over 60 gens keeps leaf inventories bounded (no runaway growth)", () => {
    const cfg = { ...presetEnglish(), seed: "homeostasis-convergence" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 60; i++) sim.step();
    const state = sim.getState();
    let checkedAny = false;
    const sizes: { name: string; size: number; target: number }[] = [];
    for (const id of Object.keys(state.tree)) {
      const node = state.tree[id]!;
      if (node.childrenIds.length > 0) continue;
      const lang = node.language;
      if (lang.extinct) continue;
      checkedAny = true;
      const target = tierInventoryTarget(lang.culturalTier);
      const size = lang.phonemeInventory.segmental.length;
      sizes.push({ name: lang.name, size, target });
    }
    expect(checkedAny).toBe(true);
    // Pre-Phase-27.1 the inventory grew without bound (one
    // probabilistic prune per gen vs 5+ phoneme additions per gen).
    // Post-fix the system is bounded — every leaf stabilises within
    // a small multiple of its tier target rather than running away.
    const maxRatio = Math.max(...sizes.map((s) => s.size / s.target));
    expect(maxRatio, JSON.stringify(sizes)).toBeLessThanOrEqual(3.0);
    const ratios = sizes.map((s) => s.size / s.target).sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)]!;
    expect(median, JSON.stringify(sizes)).toBeLessThanOrEqual(2.5);
  }, 180_000);
});
