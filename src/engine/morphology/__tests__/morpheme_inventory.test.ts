import { describe, it, expect } from "vitest";
import { createSimulation } from "../../simulation";
import { presetEnglish } from "../../presets/english";
import { tForm as lexGet } from "../../lexicon/__tests__/glossSeam";
import { formToString } from "../../phonology/ipa";
import { recordedParts } from "../../lexicon/word";
import {
  buildMorphemeInventory,
  decomposeWord,
  morphemeEntry,
} from "../morphemeInventory";

/**
 * morpheme_inventory.test.ts
 *
 * Lane D (morphology encoding) — chunk 1.
 *
 * Three guarantees:
 *   1. Seed-time morphStructure persists onto the Word at gen 0 (the
 *      ROADMAP §144 syncWordsFromLexicon gap is closed).
 *   2. A first-class per-language morpheme inventory exists, populated
 *      from recorded compounds / derivations / bound morphemes.
 *   3. A seed compound/derivation decomposes into its recorded parts and
 *      those parts RE-CONCATENATE to the word's surface form (round-trip),
 *      read from records — not from gloss-string splitting.
 */

function seedLang() {
  // English has rich seedCompounds (daylight = day+light) and seed
  // derivations (kingdom = king + -dom, darkness = dark + -ness).
  return createSimulation(presetEnglish()).getState().tree["L-0"]!.language;
}

describe("Lane D — seed morphStructure persists onto the Word (ROADMAP §144)", () => {
  it("a seeded compound carries Word.morphStructure at gen 0", () => {
    const lang = seedLang();
    const form = lexGet(lang, "daylight")!;
    expect(form, "daylight has a seed form").toBeTruthy();
    const word = lang.words!.find((w) =>
      w.senses.some((s) => s.meaning === "daylight"),
    );
    expect(word, "a Word carries the 'daylight' sense").toBeTruthy();
    expect(word!.morphStructure, "morphStructure survived seed init").toBeDefined();
    expect(word!.morphStructure!.origin).toBe("compound");
    expect(word!.morphStructure!.parts).toEqual(["day", "light"]);
  });

  it("a seeded derivation records origin 'derivation' with base + affix", () => {
    const lang = seedLang();
    const word = lang.words!.find((w) =>
      w.senses.some((s) => s.meaning === "kingdom"),
    );
    expect(word, "a Word carries the 'kingdom' sense").toBeTruthy();
    expect(word!.morphStructure, "kingdom has morphStructure").toBeDefined();
    expect(word!.morphStructure!.origin).toBe("derivation");
    expect(word!.morphStructure!.base).toBe("king");
    expect(word!.morphStructure!.affix).toBe("-dom");
  });

  it("plain (non-complex) seeded words carry no morphStructure", () => {
    const lang = seedLang();
    const word = lang.words!.find((w) =>
      w.senses.some((s) => s.meaning === "day"),
    );
    expect(word).toBeTruthy();
    expect(word!.morphStructure).toBeUndefined();
  });
});

describe("Lane D — morpheme inventory shape + population", () => {
  it("populates roots + bound affixes as first-class entries", () => {
    const lang = seedLang();
    const inv = lang.morphemeInventory;
    expect(inv, "language has a morpheme inventory at gen 0").toBeDefined();

    // The bound affix -dom is an "affix" entry with a form and position.
    const dom = morphemeEntry(lang, "-dom");
    expect(dom, "-dom is an inventory entry").toBeDefined();
    expect(dom!.category).toBe("affix");
    expect(dom!.position).toBe("suffix");
    expect(dom!.form.length).toBeGreaterThan(0);
    // Seed bound morphemes are productive at gen 0 (init.ts marks them so).
    expect(dom!.productivity).toBe(1);

    // The root "light" (a constituent of daylight/moonlight/sunlight) is a
    // "root" entry — read from records, not invented.
    const light = morphemeEntry(lang, "light");
    expect(light, "'light' is an inventory entry (compound constituent)").toBeDefined();
    expect(light!.category).toBe("root");
    expect(light!.form).toEqual(lexGet(lang, "light"));
  });

  it("buildMorphemeInventory is a pure rebuild from records (deterministic)", () => {
    const lang = seedLang();
    const a = buildMorphemeInventory(lang);
    const b = buildMorphemeInventory(lang);
    expect(Object.keys(a.entries).sort()).toEqual(Object.keys(b.entries).sort());
  });
});

describe("Lane D — decomposition round-trip (parts re-concatenate to the form)", () => {
  it("a seed compound decomposes into its recorded parts that re-join to the form", () => {
    const lang = seedLang();
    const parts = decomposeWord(lang, "daylight");
    expect(parts, "daylight decomposes via the inventory").toBeTruthy();
    // Decomposition reads RECORDS, not the gloss string.
    expect(parts!.map((p) => p.meaning)).toEqual(recordedParts(lang, "daylight"));
    // Round-trip: the constituent forms re-concatenate to the surface form.
    const rejoined = parts!.flatMap((p) => p.form);
    expect(formToString(rejoined)).toBe(formToString(lexGet(lang, "daylight")!));
  });

  it("a seed derivation round-trips (base ++ affix === derived form)", () => {
    const lang = seedLang();
    const parts = decomposeWord(lang, "kingdom");
    expect(parts, "kingdom decomposes via the inventory").toBeTruthy();
    expect(parts!.map((p) => p.meaning)).toEqual(["king", "-dom"]);
    const rejoined = parts!.flatMap((p) => p.form);
    expect(formToString(rejoined)).toBe(formToString(lexGet(lang, "kingdom")!));
  });

  it("a plain word has no recorded decomposition", () => {
    const lang = seedLang();
    expect(decomposeWord(lang, "day")).toBeNull();
  });

  it("every recorded compound round-trips at gen 0 (transparent, pre-fossilisation)", () => {
    const lang = seedLang();
    let checked = 0;
    for (const meaning of Object.keys(lang.compounds ?? {})) {
      const meta = lang.compounds![meaning]!;
      if (meta.fossilized) continue;
      const parts = decomposeWord(lang, meaning);
      if (!parts) continue; // a part may have been colexified away; skip
      const rejoined = parts.flatMap((p) => p.form);
      const surface = lexGet(lang, meaning);
      if (!surface) continue;
      expect(
        formToString(rejoined),
        `${meaning} re-concatenates to its surface form`,
      ).toBe(formToString(surface));
      checked++;
    }
    // English seeds well over a dozen transparent compounds/derivations.
    expect(checked).toBeGreaterThan(5);
  });
});
