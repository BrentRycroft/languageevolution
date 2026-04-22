import { describe, it, expect } from "vitest";
import { BASIC_240, clusterOfBasic240, fillMissing } from "../lexicon/basic240";
import { clusterOf } from "../semantics/clusters";
import { neighborsOf } from "../semantics/neighbors";
import { complexityFor } from "../lexicon/complexity";
import { DEFAULT_LEXICON, DEFAULT_PHONOLOGY } from "../lexicon/defaults";

describe("Basic-240 lexicon", () => {
  it("has at least 200 unique meanings", () => {
    expect(BASIC_240.length).toBeGreaterThanOrEqual(200);
    const set = new Set(BASIC_240);
    expect(set.size).toBe(BASIC_240.length);
  });

  it("every meaning has a cluster", () => {
    for (const m of BASIC_240) {
      expect(clusterOfBasic240(m), `cluster for ${m}`).toBeDefined();
      expect(clusterOf(m), `public clusterOf for ${m}`).toBeDefined();
    }
  });

  it("every meaning has a complexity in [1, 5]", () => {
    for (const m of BASIC_240) {
      const c = complexityFor(m);
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(5);
    }
  });

  it("most meanings have at least one semantic neighbor", () => {
    let withNeighbors = 0;
    for (const m of BASIC_240) {
      if (neighborsOf(m).length > 0) withNeighbors++;
    }
    // Not every meaning has to have a neighbour entry, but most should.
    expect(withNeighbors / BASIC_240.length).toBeGreaterThan(0.9);
  });

  it("fillMissing generates a form for every meaning", () => {
    const keys = Object.keys(DEFAULT_LEXICON);
    for (const m of BASIC_240) {
      expect(keys, `fillMissing populated ${m}`).toContain(m);
    }
  });

  it("fillMissing only uses phonemes from the phonology inventory", () => {
    const allowed = new Set<string>([
      ...DEFAULT_PHONOLOGY.onsets,
      ...DEFAULT_PHONOLOGY.vowels,
      ...(DEFAULT_PHONOLOGY.codas ?? []),
      ...(DEFAULT_PHONOLOGY.flavour ?? []),
    ]);
    // Check only the machine-generated entries (core meanings may use
    // whatever IPA the preset author wrote).
    const coreMeanings = new Set(Object.keys(
      fillMissing({}, DEFAULT_PHONOLOGY),
    ));
    for (const m of coreMeanings) {
      for (const p of DEFAULT_LEXICON[m]!) {
        // Only enforce for non-hand-authored meanings; we test on the
        // deterministic output of fillMissing against an empty core.
        if (!allowed.has(p)) {
          const regenerated = fillMissing({}, DEFAULT_PHONOLOGY)[m];
          for (const rp of regenerated ?? []) {
            expect(allowed, `${m} phoneme ${rp}`).toContain(rp);
          }
          break;
        }
      }
    }
  });

  it("fillMissing is deterministic for the same inputs", () => {
    const a = fillMissing({}, DEFAULT_PHONOLOGY);
    const b = fillMissing({}, DEFAULT_PHONOLOGY);
    for (const m of BASIC_240) {
      expect(a[m]).toEqual(b[m]);
    }
  });
});
