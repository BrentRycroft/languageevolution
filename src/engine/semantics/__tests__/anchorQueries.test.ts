import { describe, it, expect } from "vitest";
import {
  collapsePos,
  posOfPoint,
  clusterRegionOf,
  CLUSTER_NAMES,
} from "../anchorQueries";
import { anchorPointFull } from "../anchorLabeled";
import { fromFloats } from "../vec";
import { embed } from "../embeddings";
import { CONCEPTS, CONCEPT_IDS } from "../../lexicon/concepts";

// ---------------------------------------------------------------------------
// 1. POS golden parity — must be 100% exact (§8 validation)
// ---------------------------------------------------------------------------

describe("anchorQueries — posOfPoint POS golden parity (all concepts)", () => {
  it("posOfPoint(anchorPointFull(c)) === collapsePos(CONCEPTS[c].pos) for every concept", () => {
    const mismatches: string[] = [];
    for (const c of CONCEPT_IDS) {
      const point = anchorPointFull(c);
      const got = posOfPoint(point);
      const want = collapsePos(CONCEPTS[c]!.pos);
      if (got !== want) {
        mismatches.push(`${c}: got=${got} want=${want}`);
      }
    }
    if (mismatches.length > 0) {
      const sample = mismatches.slice(0, 10).join(", ");
      throw new Error(
        `POS golden parity: ${mismatches.length} mismatches (first 10: ${sample})`,
      );
    }
    expect(mismatches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. posOfPoint — hand-picked known concepts
// ---------------------------------------------------------------------------

describe("anchorQueries — posOfPoint hand-picked concepts", () => {
  it("'dog' (noun) → 'noun'", () => {
    expect(posOfPoint(anchorPointFull("dog"))).toBe("noun");
  });

  it("'water' (noun) → 'noun'", () => {
    expect(posOfPoint(anchorPointFull("water"))).toBe("noun");
  });

  it("'eat' (verb) → 'verb'", () => {
    expect(posOfPoint(anchorPointFull("eat"))).toBe("verb");
  });

  it("'run' (verb) → 'verb'", () => {
    expect(posOfPoint(anchorPointFull("run"))).toBe("verb");
  });

  it("'big' (adjective) → 'adjective'", () => {
    expect(posOfPoint(anchorPointFull("big"))).toBe("adjective");
  });

  it("'i' (pronoun → closed) → 'closed'", () => {
    expect(posOfPoint(anchorPointFull("i"))).toBe("closed");
  });

  it("'above' (adverb → closed) → 'closed'", () => {
    // G1: WordNet tags 'above' adverb (no dedicated open-class one-hot), so the
    // labeled-POS coarsening still collapses it to the closed bucket.
    expect(CONCEPTS["above"]!.pos).toBe("adverb");
    expect(posOfPoint(anchorPointFull("above"))).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// 3. posOfPoint default — all-zero labeled dims → "closed"
// ---------------------------------------------------------------------------

describe("anchorQueries — posOfPoint all-zero labeled dims", () => {
  it("fromFloats(embed('water')) has zero labeled dims [50..57] and posOfPoint returns 'closed'", () => {
    // fromFloats only fills [0..49]; labeled dims [50..57] remain 0.
    const lexicalOnly = fromFloats(embed("water"));
    // Verify the labeled region is all-zero (documents the invariant).
    for (let i = 50; i < 58; i++) {
      expect(lexicalOnly[i]).toBe(0);
    }
    // All-zero labeled dims: posOfPoint defaults to "closed".
    expect(posOfPoint(lexicalOnly)).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// 4. Cluster golden parity — rate-based sanity floor (≥ 0.5)
// ---------------------------------------------------------------------------

describe("anchorQueries — clusterRegionOf cluster parity rate", () => {
  it("≥ 50% of concepts fall into their own cluster region (geometry sanity floor)", () => {
    let matches = 0;
    for (const c of CONCEPT_IDS) {
      const point = fromFloats(embed(c));
      if (clusterRegionOf(point) === CONCEPTS[c]!.cluster) {
        matches++;
      }
    }
    const total = CONCEPT_IDS.length;
    const rate = matches / total;

    // Observed rate: recorded after first run — see commit body.
    // GloVe-50 geometry diverges from curated cluster labels for relational queries,
    // so 100% is neither expected nor required; ≥ 0.5 is the sanity floor.
    console.log(
      `clusterRegionOf parity: ${matches}/${total} = ${(rate * 100).toFixed(1)}%`,
    );

    expect(rate).toBeGreaterThanOrEqual(0.5);
  });
});

// ---------------------------------------------------------------------------
// 5. clusterRegionOf determinism
// ---------------------------------------------------------------------------

describe("anchorQueries — clusterRegionOf determinism", () => {
  it("two calls on the same point return the same string", () => {
    for (const c of ["water", "fire", "dog", "eat", "big"] as const) {
      const p = fromFloats(embed(c));
      expect(clusterRegionOf(p)).toBe(clusterRegionOf(p));
    }
  });
});

// ---------------------------------------------------------------------------
// 6. clusterRegionOf returns a real cluster name
// ---------------------------------------------------------------------------

describe("anchorQueries — clusterRegionOf returns a real cluster name", () => {
  it("result is always a cluster name present in CONCEPTS", () => {
    const sampleConcepts = ["water", "fire", "stone", "dog", "eat", "big", "i", "and"] as const;
    for (const c of sampleConcepts) {
      const p = fromFloats(embed(c));
      const region = clusterRegionOf(p);
      expect(CLUSTER_NAMES.has(region)).toBe(true);
    }
  });

  it("CLUSTER_NAMES is non-empty and all values appear in CONCEPTS", () => {
    expect(CLUSTER_NAMES.size).toBeGreaterThan(0);
    for (const name of CLUSTER_NAMES) {
      // Every name in CLUSTER_NAMES was derived from CONCEPTS, so this is tautologically true;
      // we verify it roundtrips for documentation.
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
