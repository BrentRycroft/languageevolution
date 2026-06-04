import { describe, it, expect } from "vitest";
import { glossLemma } from "../lexicon/word";
import type { Language } from "../types";

/**
 * Lane F: a back-translation / caption gloss must never leak raw derivation
 * scaffolding — a doubled hyphen `--` from a prefix-formed key, or a trailing
 * `.category` tag — even when the affix that coined the key has since been lost
 * from the language's `boundMorphemes` (so `peelDerivation` can't reach it). This
 * reproduces, without depending on any particular sim trajectory, the leak that
 * surfaced as `you-dis--ric` in `narrative_gloss_clean` (romance) once Lane A's
 * sound changes made genesis coin that key.
 */

// Same scaffolding signature the behaviour-LOCK test uses.
const SCAFFOLD = /[.·](agt|tbef|abs|ptcp|adj|inst|cmp|dim|neg|fem|action)\b|--/;

function lang(bound: string[] = []): Language {
  return { boundMorphemes: new Set(bound) } as unknown as Language;
}

describe("glossLemma — captions never leak affix scaffolding", () => {
  it("collapses the doubled hyphen of a prefix-formed key whose affix is lost", () => {
    const out = glossLemma(lang(), "you-dis--ric");
    expect(SCAFFOLD.test(out)).toBe(false);
    expect(out).not.toContain("--");
  });

  it("lifts a trailing .category tag into an uppercase Leipzig tag", () => {
    expect(glossLemma(lang(), "ant-tas.abs")).toBe("ant-tas-ABS");
    expect(SCAFFOLD.test(glossLemma(lang(), "ask-arius.agt"))).toBe(false);
  });

  it("still peels affixes the language DOES track (normal path)", () => {
    expect(glossLemma(lang(["-tér.agt"]), "build-tér.agt")).toBe("build-AGT");
  });

  it("leaves a plain word untouched", () => {
    expect(glossLemma(lang(), "water")).toBe("water");
  });
});
