import { describe, it, expect } from "vitest";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";

describe("Phase 24 — compensatory lengthening rules", () => {
  it("compensatory.final_coda_lengthening turns VC# into Vː#", () => {
    const rule = CATALOG_BY_ID["compensatory.final_coda_lengthening"];
    expect(rule).toBeDefined();
    const rng = makeRng("compensatory-final");
    // Word: [p, a, t]. Final /t/ deletes, /a/ lengthens.
    const out = rule!.apply(["p", "a", "t"], rng);
    expect(out).toEqual(["p", "aː"]);
  });

  it("compensatory.final_coda_lengthening does not fire when the vowel is already long", () => {
    const rule = CATALOG_BY_ID["compensatory.final_coda_lengthening"];
    expect(rule!.probabilityFor(["p", "aː", "t"])).toBe(0);
  });

  it("compensatory.medial_coda_lengthening turns V₁CC# into Vː₁C#", () => {
    const rule = CATALOG_BY_ID["compensatory.medial_coda_lengthening"];
    expect(rule).toBeDefined();
    // Word: [a, k, t, a]. Medial /k/ deletes, /a/ lengthens → [aː, t, a].
    // Run apply enough times to overcome rng-pick variance.
    const rng = makeRng("compensatory-medial");
    const out = rule!.apply(["a", "k", "t", "a"], rng);
    expect(out.length).toBe(3);
    expect(out[0]!.endsWith("ː")).toBe(true);
  });

  it("compensatory.medial_coda_lengthening does not fire when there's no medial CC pattern", () => {
    const rule = CATALOG_BY_ID["compensatory.medial_coda_lengthening"];
    expect(rule!.probabilityFor(["a", "t", "a"])).toBe(0);
    expect(rule!.probabilityFor(["a", "t"])).toBe(0);
  });

  it("compensatory.final_coda_lengthening has weight bumped to 1.4 (was 0.6) for Phase 24 balance", () => {
    const rule = CATALOG_BY_ID["compensatory.final_coda_lengthening"];
    expect(rule!.baseWeight).toBeCloseTo(1.4, 2);
  });

  it("insertion.shape_repair_epenthesis adds a vowel to break a CC- onset", () => {
    const rule = CATALOG_BY_ID["insertion.shape_repair_epenthesis"];
    expect(rule).toBeDefined();
    // Word: [s, p, a]. CC- onset → epenthesis prepends a vowel.
    const rng = makeRng("epenthesis");
    const out = rule!.apply(["s", "p", "a"], rng);
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(out[0]).toBe("ə");
  });

  it("insertion.shape_repair_epenthesis adds a vowel to break a CC# coda", () => {
    const rule = CATALOG_BY_ID["insertion.shape_repair_epenthesis"];
    const rng = makeRng("epenthesis-coda");
    // Word: [a, k, t]. CC# coda → epenthesis between k and t.
    const out = rule!.apply(["a", "k", "t"], rng);
    expect(out.length).toBe(4);
    // Either [a, k, ə, t] or [a, ə, k, t] depending on rule preference.
    expect(out).toContain("ə");
  });

  it("insertion.shape_repair_epenthesis does not fire on simple CV-CV words", () => {
    const rule = CATALOG_BY_ID["insertion.shape_repair_epenthesis"];
    expect(rule!.probabilityFor(["a", "t", "a"])).toBe(0);
    expect(rule!.probabilityFor(["b", "a", "t", "a"])).toBe(0);
  });
});
