import { describe, it, expect } from "vitest";
import { applyParadigm } from "../apply";
import type { Paradigm } from "../types";

/**
 * apply_kinds.test.ts
 *
 * Test suite for: "Phase 52 T2 — applyParadigm dispatcher".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function p(kind: Paradigm["kind"], extras: Partial<Paradigm> = {}): Paradigm {
  return {
    affix: [],
    position: "suffix",
    category: "verb.tense.past",
    kind,
    ...extras,
  };
}

describe("Phase 52 T2 — applyParadigm dispatcher", () => {
  it("affix prefix concat (legacy default)", () => {
    const par = p("affix", { affix: ["u","n"], position: "prefix" });
    expect(applyParadigm(["d","o"], par)).toEqual(["u","n","d","o"]);
  });

  it("affix suffix concat (legacy default)", () => {
    const par = p("affix", { affix: ["d"], position: "suffix" });
    expect(applyParadigm(["w","a","l","k"], par)).toEqual(["w","a","l","k","d"]);
  });

  it("infix after-first-V splices the affix after the first vowel", () => {
    // sulat + um → sumulat (Tagalog actor focus)
    const par = p("infix", {
      affix: ["u","m"],
      insertionPoint: "after-first-V",
    });
    expect(applyParadigm(["s","u","l","a","t"], par))
      .toEqual(["s","u","u","m","l","a","t"]);
  });

  it("infix before-last-V splices before the last vowel", () => {
    const par = p("infix", { affix: ["x"], insertionPoint: "before-last-V" });
    expect(applyParadigm(["k","a","t","i","b"], par))
      .toEqual(["k","a","t","x","i","b"]);
  });

  it("circumfix splits affix on '_' and wraps stem", () => {
    // kauf + ge_t → gekauft (German perfective participle)
    const par = p("circumfix", { affix: ["g","e","_","t"] });
    expect(applyParadigm(["k","a","u","f"], par))
      .toEqual(["g","e","k","a","u","f","t"]);
  });

  it("circumfix without '_' separator falls back to prefix concat", () => {
    const par = p("circumfix", { affix: ["x"] });
    expect(applyParadigm(["a"], par)).toEqual(["x","a"]);
  });

  it("reduplicate full copies the stem", () => {
    // wiki → wikiwiki
    const par = p("reduplicate", { reduplication: "full" });
    expect(applyParadigm(["w","i","k","i"], par))
      .toEqual(["w","i","k","i","w","i","k","i"]);
  });

  it("reduplicate partial-initial prepends a CV chunk", () => {
    const par = p("reduplicate", { reduplication: "partial-initial" });
    // ka.no → ka-ka.no (prepend "ka")
    expect(applyParadigm(["k","a","n","o"], par))
      .toEqual(["k","a","k","a","n","o"]);
  });

  it("ablaut maps vowels per ablautMap", () => {
    // sing + {i: a} → sang
    const par = p("ablaut", { ablautMap: { i: "a" } });
    expect(applyParadigm(["s","i","ŋ"], par)).toEqual(["s","a","ŋ"]);
  });

  it("template fills CVCVC from root consonants + vowel", () => {
    // k-t-b + CaCiC + a → kataba (perfect verb)
    const par = p("template", { templatePattern: "CVCVCa", templateVowel: "a" });
    expect(applyParadigm(["k","t","b"], par))
      .toEqual(["k","a","t","a","b","a"]);
  });

  it("template with insufficient consonants returns stem unchanged", () => {
    const par = p("template", { templatePattern: "CVCVC", templateVowel: "i" });
    expect(applyParadigm(["k"], par)).toEqual(["k"]);
  });

  it("conversion is identity (zero-derivation)", () => {
    const par = p("conversion");
    expect(applyParadigm(["r","u","n"], par)).toEqual(["r","u","n"]);
  });

  it("missing kind defaults to affix concat (back-compat)", () => {
    const par: Paradigm = {
      affix: ["s"],
      position: "suffix",
      category: "noun.num.pl",
    };
    expect(applyParadigm(["d","o","g"], par)).toEqual(["d","o","g","s"]);
  });
});
