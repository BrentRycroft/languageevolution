import { describe, it, expect } from "vitest";
import { glossOf } from "../anchors";
import { senseGloss, lexPoint, sensePoint } from "../meaningPoint";
import { fromFloats } from "../vec";
import { embed } from "../embeddings";
import { CONCEPT_IDS } from "../../lexicon/concepts";
import type { WordSense } from "../../types";

describe("emergent gloss — glossOf(point)", () => {
  it("a concept's own anchor point glosses back to that concept", () => {
    for (const c of ["water", "fire", "stone", "tree", "mountain"] as const) {
      expect(glossOf(fromFloats(embed(c)))).toBe(c);
    }
  });

  it("seed-time parity: glossOf(lexPoint(c)) === c for the vast majority of concepts", () => {
    let agree = 0;
    const diverged: string[] = [];
    for (const c of CONCEPT_IDS) {
      if (glossOf(lexPoint(c)) === c) agree++;
      else if (diverged.length < 12) diverged.push(c);
    }
    const rate = agree / CONCEPT_IDS.length;
    // eslint-disable-next-line no-console
    console.log(`emergent-gloss seed parity: ${agree}/${CONCEPT_IDS.length} = ${(rate * 100).toFixed(1)}%`);
    // The emergent label equals the authored meaning at seed time except where a baked morpheme
    // composition (or a quantization collision) sits nearest a different anchor — those are the
    // legitimate "emergent" divergences. A high floor proves the mechanism is faithful.
    expect(rate).toBeGreaterThanOrEqual(0.9);
  });
});

describe("emergent gloss — senseGloss(sense)", () => {
  const base = { weight: 1, bornGeneration: 0 } as const;

  it("falls back to the meaning's seed point when the sense hasn't glided", () => {
    const s: WordSense = { meaning: "water", ...base };
    expect(senseGloss(s)).toBe(glossOf(sensePoint(s)));
    expect(senseGloss(s)).toBe("water");
  });

  it("a glided sense re-labels to the anchor nearest its new point", () => {
    // Park the sense exactly on the "fire" anchor: its emergent gloss must become "fire".
    const s: WordSense = { meaning: "water", ...base, point: Array.from(fromFloats(embed("fire"))) };
    expect(senseGloss(s)).toBe("fire");
  });

  it("is deterministic — repeat calls agree", () => {
    const s: WordSense = { meaning: "river", ...base };
    expect(senseGloss(s)).toBe(senseGloss(s));
  });
});
