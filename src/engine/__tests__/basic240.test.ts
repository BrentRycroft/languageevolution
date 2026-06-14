import { describe, it, expect } from "vitest";
import { fillMissing } from "../lexicon/basic240";
import { conceptsAtOrBelow } from "../lexicon/concepts";
import { clusterOf } from "../semantics/clusters";
import { neighborsOf } from "../semantics/neighbors";
import { complexityFor } from "../lexicon/complexity";
import { DEFAULT_LEXICON, DEFAULT_PHONOLOGY } from "../lexicon/defaults";

/**
 * basic240.test.ts
 *
 * Test suite for: "core lexicon (tier-0 + fillMissing)".
 *
 * G1: the hand BASIC_240 list is retired; the "core" meaning set is now the
 * geometry-derived tier-0 (`conceptsAtOrBelow(0)`), and that is what
 * `fillMissing` pads the default lexicon up to.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("core lexicon (tier-0 + fillMissing)", () => {
  const CORE = conceptsAtOrBelow(0);

  it("has a substantial tier-0 core of unique meanings", () => {
    expect(CORE.length).toBeGreaterThanOrEqual(200);
    expect(new Set(CORE).size).toBe(CORE.length);
  });

  it("every core meaning resolves to a (geometric) cluster", () => {
    for (const m of CORE) {
      expect(clusterOf(m), `public clusterOf for ${m}`).toBeDefined();
    }
  });

  it("every core meaning has a complexity in [1, 5]", () => {
    for (const m of CORE) {
      const c = complexityFor(m);
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(5);
    }
  });

  it("most core meanings have at least one semantic neighbor", () => {
    let withNeighbors = 0;
    for (const m of CORE) {
      if (neighborsOf(m).length > 0) withNeighbors++;
    }
    expect(withNeighbors / CORE.length).toBeGreaterThan(0.9);
  });

  it("fillMissing generates a form for every core meaning", () => {
    const keys = Object.keys(DEFAULT_LEXICON);
    for (const m of CORE) {
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
    const generated = fillMissing({}, DEFAULT_PHONOLOGY);
    for (const m of Object.keys(generated)) {
      for (const p of generated[m]!) {
        expect(allowed, `${m} phoneme ${p}`).toContain(p);
      }
    }
  });

  it("fillMissing is deterministic for the same inputs", () => {
    const a = fillMissing({}, DEFAULT_PHONOLOGY);
    const b = fillMissing({}, DEFAULT_PHONOLOGY);
    for (const m of CORE) {
      expect(a[m]).toEqual(b[m]);
    }
  });
});
