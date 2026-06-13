/**
 * Tests for findSemanticGap — the pure-geometry empty-region detector.
 *
 * Geometry basis (measured by probe, 2026-06):
 *   - Fixed-point NN distances within a semantic cluster: ~120k-200k
 *   - "think" cluster at r=200000: [think, what, why, know, something, we, thing]
 *   - When lexicon = cluster minus "think": support=6, nearestDistSq=27665629184 (√≈166330)
 *   - "fire" cluster at r=200000: just [fire] itself (isolated)
 */
import { describe, it, expect } from "vitest";
import { findSemanticGap } from "../genesis/semanticGap";
import { anchorsWithin } from "../semantics/anchors";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { tSet as lexSet } from "../lexicon/__tests__/glossSeam";
import type { Language } from "../types";

function bareLang(): Language {
  return {
    id: "L-0", name: "Proto", lexemes: {}, lexemeIds: {},
    enabledChangeIds: [], changeWeights: {}, birthGeneration: 0,
    grammar: {}, events: [], wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} }, localNeighbors: {}, conservatism: 1,
    wordOrigin: {}, activeRules: [], orthography: {}, otRanking: [], lastChangeGeneration: {},
  } as unknown as Language;
}

// The "think" anchor's neighbours at r=200000: [think, what, why, know, something, we, thing]
// When lexicon contains all of those except "think", support=6, nearestDist≈166330 > MIN_GAP_DIST.
const T_CONCEPT = "think";
const T_RADIUS = 200000;
const T_POINT = fromFloats(embed(T_CONCEPT));
const T_CLUSTER = anchorsWithin(T_POINT, T_RADIUS); // includes "think" itself
const T_LEXICON_CONCEPTS = T_CLUSTER.map(a => a.concept).filter(c => c !== T_CONCEPT);

describe("findSemanticGap", () => {
  it("returns a gap for a surrounded empty anchor", () => {
    const lang = bareLang();
    // Populate lexicon with all "think" cluster members except "think" itself
    for (const concept of T_LEXICON_CONCEPTS) {
      lexSet(lang, concept, ["x"]);
    }
    const gap = findSemanticGap(lang);
    expect(gap).not.toBeNull();
    expect(gap!.neighborSupport).toBeGreaterThanOrEqual(3);
    // The gap's gloss must not be one the language already has
    expect(T_LEXICON_CONCEPTS).not.toContain(gap!.gloss);
  });

  it("finds 'think' specifically when it is the only qualified gap in that cluster", () => {
    const lang = bareLang();
    for (const concept of T_LEXICON_CONCEPTS) {
      lexSet(lang, concept, ["x"]);
    }
    const gap = findSemanticGap(lang);
    // "think" is the specific unlexicalised anchor with high support in this cluster;
    // assert we get it (or at least a valid gap — guards against geometry regressions)
    expect(gap).not.toBeNull();
    // gloss must not be in lexicon
    expect(T_LEXICON_CONCEPTS).not.toContain(gap!.gloss);
    // The most supported gap in the "think" cluster is "think" itself
    expect(gap!.gloss).toBe(T_CONCEPT);
  });

  it("does NOT return 'think' when it is already lexicalised", () => {
    const lang = bareLang();
    for (const concept of T_LEXICON_CONCEPTS) {
      lexSet(lang, concept, ["x"]);
    }
    // Also add "think" itself
    lexSet(lang, T_CONCEPT, ["x"]);
    const gap = findSemanticGap(lang);
    // gap may be null or a different concept — must not be T_CONCEPT
    expect(gap?.gloss).not.toBe(T_CONCEPT);
  });

  it("returns null for an isolated language (single word — no populated neighbourhood)", () => {
    // "fire" at r=200000 has only itself in its cluster → no candidate anchors
    const lang = bareLang();
    lexSet(lang, "fire", ["x"]);
    const gap = findSemanticGap(lang);
    expect(gap).toBeNull();
  });

  it("returns null for a language with no words", () => {
    const lang = bareLang();
    const gap = findSemanticGap(lang);
    expect(gap).toBeNull();
  });

  it("is deterministic — same result on repeated calls", () => {
    const lang = bareLang();
    for (const concept of T_LEXICON_CONCEPTS) {
      lexSet(lang, concept, ["x"]);
    }
    const gap1 = findSemanticGap(lang);
    const gap2 = findSemanticGap(lang);
    expect(gap1).not.toBeNull();
    expect(gap1!.gloss).toBe(gap2!.gloss);
    expect(Array.from(gap1!.point)).toEqual(Array.from(gap2!.point));
    expect(gap1!.nearestExistingDistSq).toBe(gap2!.nearestExistingDistSq);
    expect(gap1!.neighborSupport).toBe(gap2!.neighborSupport);
  });

  it("includes keyless lexeme points in the 'existing words' set", () => {
    const lang = bareLang();
    for (const concept of T_LEXICON_CONCEPTS) {
      lexSet(lang, concept, ["x"]);
    }
    // Put a keyless (gloss-less) record right at the "think" anchor point
    const thinkPoint = Array.from(fromFloats(embed(T_CONCEPT)));
    lang.lexemes["kl-0"] = { form: ["y"], point: thinkPoint };
    const gap = findSemanticGap(lang);
    // With a keyless lexeme on "think", the gap (if any) must be further away or null
    if (gap !== null) {
      // nearestExistingDistSq must be > MIN_GAP_DIST² (100000²)
      expect(gap.nearestExistingDistSq).toBeGreaterThan(100000 * 100000);
    }
    // At minimum, result gloss is not "think" (the keyless point overlaps it)
    expect(gap?.gloss).not.toBe(T_CONCEPT);
  });
});
