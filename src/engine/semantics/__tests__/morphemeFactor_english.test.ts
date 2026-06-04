import { describe, it, expect } from "vitest";
import { presetEnglish } from "../../presets/english";
import { embed } from "../embeddings";
import { fromFloats, distanceSq, type Vec } from "../vec";
import { factorizeMorphemes, type Decomp } from "../morphemeFactor";

const isAffix = (id: string) => id.startsWith("-") || id.endsWith("-");

function buildEnglishInput() {
  const cfg = presetEnglish();
  const compounds = cfg.seedCompounds ?? {};
  const derivs = cfg.seedDerivations ?? {};
  const roots = new Map<string, Vec>();
  const affixIds = new Set<string>();
  const decomps: Decomp[] = [];
  const addRoot = (m: string) => { if (!roots.has(m)) roots.set(m, fromFloats(embed(m))); };

  for (const [word, c] of Object.entries(compounds)) {
    for (const p of c.parts) (isAffix(p) ? affixIds.add(p) : addRoot(p));
    decomps.push({ word, wordAnchor: fromFloats(embed(word)), parts: c.parts.slice() });
  }
  for (const [word, d] of Object.entries(derivs)) {
    isAffix(d.affix) ? affixIds.add(d.affix) : addRoot(d.affix);
    addRoot(d.base);
    decomps.push({ word, wordAnchor: fromFloats(embed(word)), parts: [d.base, d.affix] });
  }
  return { roots, affixIds, decomps };
}

describe("morphemeFactor — real English preset", () => {
  it("derives the expected authored affixes", () => {
    const { affixIds } = buildEnglishInput();
    for (const a of ["-er.agt", "-ness", "-dom", "-ship", "-hood", "be-"]) {
      expect(affixIds.has(a)).toBe(true);
    }
  });
  it("the composition invariant holds for every authored word (point == Σ parts)", () => {
    const input = buildEnglishInput();
    const { morphemes, wordPoints } = factorizeMorphemes(input);
    for (const d of input.decomps) {
      const composed = d.parts
        .map((p) => morphemes.get(p)!)
        .reduce((acc, v) => { for (let i = 0; i < v.length; i++) acc[i]! += v[i]!; return acc; },
          new Int32Array(wordPoints.get(d.word)!.length));
      expect(distanceSq(wordPoints.get(d.word)!, composed), d.word).toBe(0);
    }
  });
  it("a single-occurrence affix reconstructs its word's anchor exactly (behind = hind + be-)", () => {
    const { wordPoints } = factorizeMorphemes(buildEnglishInput());
    expect(distanceSq(wordPoints.get("behind")!, fromFloats(embed("behind")))).toBe(0);
  });
  it("is deterministic — same inputs produce the same affix vectors", () => {
    const a = factorizeMorphemes(buildEnglishInput()).morphemes.get("-er.agt")!;
    const b = factorizeMorphemes(buildEnglishInput()).morphemes.get("-er.agt")!;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
