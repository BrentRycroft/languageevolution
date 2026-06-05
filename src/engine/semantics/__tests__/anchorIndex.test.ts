import { describe, it, expect } from "vitest";
import { anchorIndexOf, glossOfWord, findWordByEmergentGloss } from "../anchorIndex";
import { findPrimaryWordForMeaning } from "../../lexicon/word";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import { presetTokipona } from "../../presets/tokipona";
import type { Language } from "../../types";

function rootLang(cfg: ReturnType<typeof presetEnglish>): Language {
  const sim = createSimulation(cfg);
  const s = sim.getState();
  return s.tree[s.rootId]!.language;
}

describe("anchorIndex — point-native 'what means concept X'", () => {
  const lang = rootLang(presetEnglish());

  it("indexes every sense under its emergent gloss", () => {
    const idx = anchorIndexOf(lang);
    // a core concept the English preset seeds resolves to a non-empty bucket
    expect(idx.get("water")?.length).toBeGreaterThanOrEqual(1);
    // every bucket's entries carry the gloss they're filed under
    for (const [gloss, bucket] of idx) {
      for (const e of bucket) expect(e.gloss).toBe(gloss);
    }
  });

  it("glossOfWord reads a word's emergent label from its primary sense", () => {
    const w = findPrimaryWordForMeaning(lang, "water")!;
    expect(w).toBeTruthy();
    expect(glossOfWord(w)).toBe("water");
  });

  it("findWordByEmergentGloss agrees with findPrimaryWordForMeaning for seeded concepts", () => {
    for (const c of ["water", "fire", "stone", "tree", "eat", "big"] as const) {
      const geometric = findWordByEmergentGloss(lang, c);
      const stored = findPrimaryWordForMeaning(lang, c);
      if (stored) {
        expect(geometric).toBeTruthy();
        expect(geometric!.formKey).toBe(stored.formKey);
      }
    }
  });

  it("golden parity: emergent-gloss lookup matches stored lookup across the whole seeded lexicon", () => {
    let agree = 0;
    let total = 0;
    const diverged: string[] = [];
    for (const w of lang.words ?? []) {
      const primary = w.senses[w.primarySenseIndex];
      if (!primary || primary.synonym) continue;
      total++;
      const stored = findPrimaryWordForMeaning(lang, primary.meaning);
      const geometric = findWordByEmergentGloss(lang, primary.meaning);
      if (stored && geometric && stored.formKey === geometric.formKey) agree++;
      else if (diverged.length < 12) diverged.push(primary.meaning);
    }
    const rate = total > 0 ? agree / total : 1;
    // eslint-disable-next-line no-console
    console.log(`anchorIndex seed lookup parity: ${agree}/${total} = ${(rate * 100).toFixed(1)}% (diverged: ${diverged.join(", ")})`);
    // Hybrid effectiveGloss: real-anchor words use emergent gloss (==authored 99.6%), orphan/hash-point
    // words keep their authored key — so the geometric lookup is a faithful drop-in for the stored one.
    expect(rate).toBeGreaterThanOrEqual(0.98);
  });
});

describe("anchorIndex — works for a non-English preset (agnosticism)", () => {
  it("toki pona seeds resolve through emergent gloss", () => {
    const lang = rootLang(presetTokipona());
    const idx = anchorIndexOf(lang);
    expect(idx.size).toBeGreaterThan(0);
    // at least one seeded word round-trips through the geometric lookup
    const someWord = (lang.words ?? [])[0]!;
    const gloss = glossOfWord(someWord);
    expect(findWordByEmergentGloss(lang, gloss)).toBeTruthy();
  });
});
