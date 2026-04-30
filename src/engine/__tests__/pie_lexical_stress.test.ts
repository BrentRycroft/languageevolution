import { describe, it, expect } from "vitest";
import { presetPIE } from "../presets/pie";
import { createSimulation } from "../simulation";
import { isVowel, isSyllabic } from "../phonology/ipa";
import { stripTone } from "../phonology/tone";
import { stressIndex } from "../phonology/stress";
import { narrowTranscribe } from "../phonology/narrow";

function vowelCount(form: readonly string[]): number {
  let n = 0;
  for (const p of form) {
    const b = stripTone(p);
    if (isVowel(b) || isSyllabic(b)) n++;
  }
  return n;
}

describe("PIE lexical-accent map", () => {
  const cfg = presetPIE();
  const seedLex = cfg.seedLexicon!;
  const seedAccent = cfg.seedLexicalStress!;

  it("declares lexical stress on every entry that lives in the seed lexicon", () => {
    for (const [meaning] of Object.entries(seedAccent)) {
      expect(seedLex[meaning], `${meaning} accent declared but not in seed lexicon`).toBeDefined();
    }
  });

  it("never points past the form's last vowel", () => {
    for (const [meaning, idx] of Object.entries(seedAccent)) {
      const form = seedLex[meaning]!;
      const vc = vowelCount(form);
      expect(idx, `${meaning}: idx ${idx} out of range (form has ${vc} vowels)`).toBeLessThan(vc);
      expect(idx).toBeGreaterThanOrEqual(0);
    }
  });

  it("only lists overrides that actually differ from the penult fallback", () => {
    for (const [meaning, idx] of Object.entries(seedAccent)) {
      const form = seedLex[meaning]!;
      const vs: number[] = [];
      for (let i = 0; i < form.length; i++) {
        const b = stripTone(form[i]!);
        if (isVowel(b) || isSyllabic(b)) vs.push(i);
      }
      expect(vs.length, `${meaning}: 1-vowel form shouldn't need override`).toBeGreaterThanOrEqual(2);
      const penultIdx = vs.length - 2;
      expect(idx, `${meaning}: override matches penult fallback (redundant entry)`).not.toBe(penultIdx);
    }
  });

  it("places stress on the right syllable for the canonical kinship oxytones", () => {
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const ipa = (m: string) => narrowTranscribe(lang.lexicon[m]!, lang, m);
    expect(ipa("mother")).toMatch(/^[^ˈ]+\.ˈ/);
    expect(ipa("daughter")).toMatch(/^[^ˈ]+\.ˈ/);
    expect(ipa("child")).toMatch(/^[^ˈ]+\.ˈ/);
  });

  it("places stress on the first syllable for the 3-syllable acrostatics", () => {
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const ipa = (m: string) => narrowTranscribe(lang.lexicon[m]!, lang, m);
    expect(ipa("evening").startsWith("ˈ")).toBe(true);
    expect(ipa("four").startsWith("ˈ")).toBe(true);
    expect(ipa("wife").startsWith("ˈ")).toBe(true);
  });

  it("agrees with stressIndex when called via the lexical pattern + override", () => {
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    for (const [meaning, idx] of Object.entries(seedAccent)) {
      const form = lang.lexicon[meaning]!;
      const stressed = stressIndex(form, "lexical", idx);
      const vs: number[] = [];
      for (let i = 0; i < form.length; i++) {
        const b = stripTone(form[i]!);
        if (isVowel(b) || isSyllabic(b)) vs.push(i);
      }
      expect(stressed).toBe(vs[idx]);
    }
  });

  it("daughter languages inherit the lexical-stress map at split time", () => {
    const sim = createSimulation(cfg);
    sim.step();
    const tree = sim.getState().tree;
    const daughters = Object.values(tree).filter(
      (n: any) => n.parentId === "L-0",
    );
    expect(daughters.length).toBeGreaterThanOrEqual(1);
    for (const d of daughters as any[]) {
      const map = d.language.lexicalStress;
      expect(map, `${d.language.name} lost lexicalStress on split`).toBeDefined();
      for (const m of Object.keys(seedAccent)) {
        expect(map[m]).toBe(seedAccent[m]);
      }
    }
  });
});
