import { describe, it, expect } from "vitest";
import { isVowel, isSyllabic, textToIpa, sanitizeForNewick } from "../phonology/ipa";
import { featuresOf } from "../phonology/features";
import { romanize } from "../phonology/orthography";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";

describe("PIE character + syllabicity handling", () => {
  it("isVowel recognises IPA-diacritic vowels used in PIE", () => {
    for (const v of ["a", "e", "i", "o", "u", "aː", "eː", "iː", "oː", "uː"]) {
      expect(isVowel(v), v).toBe(true);
    }
  });

  it("isSyllabic accepts IPA syllabic resonants (m̩, n̩, l̩, r̩) AND their PIE-studies aliases (m̥, n̥, l̥, r̥)", () => {
    for (const s of ["m̩", "n̩", "l̩", "r̩", "m̥", "n̥", "l̥", "r̥"]) {
      expect(isSyllabic(s), s).toBe(true);
    }
  });

  it("isSyllabic rejects plain consonants", () => {
    for (const c of ["r", "l", "m", "n", "p", "t", "k"]) {
      expect(isSyllabic(c), c).toBe(false);
    }
  });

  it("featuresOf returns bundles for PIE segments", () => {
    for (const h of ["h₁", "h₂", "h₃"]) {
      const f = featuresOf(h);
      expect(f, h).toBeDefined();
      expect(f!.type).toBe("consonant");
    }
    for (const c of ["kʲ", "gʲ", "gʲʰ"]) {
      const f = featuresOf(c);
      expect(f, c).toBeDefined();
      expect(f!.type).toBe("consonant");
    }
    for (const c of ["kʷ", "gʷ", "gʷʰ"]) {
      const f = featuresOf(c);
      expect(f, c).toBeDefined();
    }
    for (const c of ["bʰ", "dʰ", "gʰ"]) {
      const f = featuresOf(c);
      expect(f, c).toBeDefined();
    }
  });

  it("featuresOf diacritic fallback handles unseen aspirate / labialised / syllabic forms", () => {
    const ph = featuresOf("pʰ");
    expect(ph?.type).toBe("consonant");
    if (ph?.type === "consonant") expect(ph.aspirated).toBe(true);
    const syllabicP = featuresOf("b̩");
    expect(syllabicP?.type).toBe("consonant");
  });

  it("PIE preset runs 60 generations without crashing and preserves syllabicity", () => {
    const sim = createSimulation(presetPIE());
    for (let i = 0; i < 60; i++) sim.step();
    const tree = sim.getState().tree;
    for (const id of Object.keys(tree)) {
      const lex = tree[id]!.language.lexicon;
      for (const [meaning, form] of Object.entries(lex)) {
        expect(form.length, `${id}/${meaning} non-empty`).toBeGreaterThan(0);
        const hasNucleus = form.some((p) => isSyllabic(p));
        expect(
          hasNucleus,
          `${id}/${meaning} = ${form.join("")} must have a syllable nucleus`,
        ).toBe(true);
      }
    }
  });

  it("textToIpa converts typed English digraphs", () => {
    expect(textToIpa("think")).toEqual(["θ", "i", "n", "k"]);
    expect(textToIpa("sheep")).toEqual(["ʃ", "eː", "p"]);
    expect(textToIpa("night")).toEqual(["n", "i", "ɣ", "t"]);
    expect(textToIpa("queen")).toEqual(["k", "w", "eː", "n"]);
    expect(textToIpa("jam")).toEqual(["dʒ", "a", "m"]);
    expect(textToIpa("make").join("")).not.toContain("e");
  });

  it("textToIpa passes IPA through unchanged", () => {
    const out = textToIpa("m̩ater");
    expect(out[0]).toBe("m̩");
  });

  it("sanitizeForNewick preserves multi-codepoint phonemes as single tokens", () => {
    const out = sanitizeForNewick(["m̩", "a", "t", "e", "r"]);
    expect(out.split("%").length).toBe(2);
    expect(out.endsWith("ater")).toBe(true);
  });

  it("romanize output stays within Latin letters + diacritics", () => {
    const sim = createSimulation(presetPIE());
    for (let i = 0; i < 20; i++) sim.step();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    for (const form of Object.values(lang.lexicon).slice(0, 30)) {
      const rom = romanize(form, lang);
      for (const ch of rom) {
        const code = ch.codePointAt(0) ?? 0;
        const isAscii = /[A-Za-z]/.test(ch);
        const isLatinExt =
          (code >= 0x00c0 && code <= 0x024f) ||
          (code >= 0x1e00 && code <= 0x1eff);
        const isCombining = code >= 0x0300 && code <= 0x036f;
        expect(
          isAscii || isLatinExt || isCombining,
          `unexpected char "${ch}" (U+${code.toString(16)}) in romanization "${rom}"`,
        ).toBe(true);
      }
    }
  });
});
