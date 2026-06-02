import { describe, it, expect } from "vitest";
import { repairOutputMapByFeatures } from "../phonology/featureGeometry";
import { featuresOf } from "../phonology/features";

/**
 * feature_repair.test.ts
 *
 * Phase 1a (evolution-realism): repairOutputMapByFeatures must produce a
 * TYPE-PRESERVING realisation of a sound change when the ideal output is
 * not in the language's inventory — not merely the nearest phoneme by raw
 * feature distance. The audit found the old behaviour corrupted change
 * TYPE: lenition (b→β) landed on a nasal /m/, palatalisation (k→tʃ)
 * landed on a labial. These tests lock the type-preservation.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("repairOutputMapByFeatures — type-preserving repair", () => {
  it("lenition (b→β) repairs to a fricative, never a nasal", () => {
    // β (voiced bilabial fricative) absent; inventory has nasals as decoys.
    const inv = ["b", "m", "v", "d", "n"];
    const repaired = repairOutputMapByFeatures({ b: "β" }, inv);
    expect(repaired).not.toBeNull();
    const out = repaired!["b"]!;
    expect(["m", "n"]).not.toContain(out); // not nasalised
    expect(featuresOf(out)!.type).toBe("consonant");
    expect((featuresOf(out) as { manner: string }).manner).toBe("fricative");
  });

  it("palatalisation (k→tʃ) repairs to a coronal, never a labial", () => {
    // tʃ absent; inventory mixes a labial decoy with coronal obstruents.
    const inv = ["p", "f", "ʃ", "t", "k", "s"];
    const repaired = repairOutputMapByFeatures({ k: "tʃ" }, inv);
    expect(repaired).not.toBeNull();
    const out = repaired!["k"]!;
    const f = featuresOf(out) as { place: string; manner: string };
    expect(f.place).not.toBe("labial");
    expect(f.place).not.toBe("labiodental");
    // a coronal/palatal fricative or affricate — the palatalisation target zone
    expect(["alveolar", "postalveolar", "retroflex", "palatal"]).toContain(f.place);
    expect(["fricative", "affricate"]).toContain(f.manner);
  });

  it("drops the rule (returns null) when no type-preserving output exists", () => {
    // k→tʃ but the inventory has only labials + a nasal: no coronal
    // obstruent can realise the palatalisation, so the change is dropped
    // rather than corrupted into a labial.
    const repaired = repairOutputMapByFeatures({ k: "tʃ" }, ["p", "b", "m"]);
    expect(repaired).toBeNull();
  });

  it("passes the output through unchanged when it is already in inventory", () => {
    const repaired = repairOutputMapByFeatures({ p: "f" }, ["p", "f", "t", "k"]);
    expect(repaired).toEqual({ p: "f" });
  });

  it("keeps deletions (to = '') untouched", () => {
    const repaired = repairOutputMapByFeatures({ h: "" }, ["p", "t", "k"]);
    expect(repaired).toEqual({ h: "" });
  });
});
