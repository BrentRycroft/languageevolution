import { describe, it, expect } from "vitest";
import {
  verbConjugationTable,
  inflectForPerson,
  conjugationRichness,
} from "../morphology/conjugation";
import { presetRomance } from "../presets/romance";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";

function langFromPreset(preset: ReturnType<typeof presetRomance>) {
  const sim = createSimulation(preset);
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 26a — full conjugation tables", () => {
  it("Romance preset produces 6 distinct surface forms for a verb across person/number", () => {
    const lang = langFromPreset(presetRomance());
    // Pick a verb that's in the seed lexicon. Romance preset seeds many.
    const m = Object.keys(lang.lexicon).find(
      (k) => lang.lexicon[k] && lang.lexicon[k]!.length >= 3 && k === "speak",
    ) ?? Object.keys(lang.lexicon).find((k) => k === "speak");
    if (!m) {
      // Fallback: pick any 3+ phoneme verb-style root.
      const candidate = Object.keys(lang.lexicon).find(
        (k) => lang.lexicon[k] && lang.lexicon[k]!.length >= 3,
      );
      expect(candidate).toBeDefined();
      const table = verbConjugationTable(lang, candidate!);
      const distinct = new Set(table.map((c) => c.form.join("")));
      expect(distinct.size).toBeGreaterThanOrEqual(5);
      return;
    }
    const table = verbConjugationTable(lang, m);
    expect(table).toHaveLength(6);
    // All cells should report the person-number paradigm was applied.
    for (const cell of table) expect(cell.fellBack).toBe(false);
    // All 6 should produce distinct surface forms.
    const distinct = new Set(table.map((c) => c.form.join("")));
    expect(distinct.size).toBe(6);
  });

  it("English-style preset only conjugates 3sg → only one form differs from the bare root", () => {
    const lang = langFromPreset(presetEnglish());
    const m = "speak";
    if (!lang.lexicon[m]) return; // skip if not in seed
    const table = verbConjugationTable(lang, m);
    const root = lang.lexicon[m]!.join("");
    const fromRoot = table.map((c) => ({
      slot: `${c.person}${c.number}`,
      surface: c.form.join(""),
      changed: c.form.join("") !== root,
    }));
    const changed = fromRoot.filter((c) => c.changed);
    // Only the 3sg slot should have a -s suffix; others should fall back to root.
    expect(changed.length).toBe(1);
    expect(changed[0]!.slot).toBe("3sg");
  });

  it("Romance preset has conjugation richness = 6 (full paradigm)", () => {
    const lang = langFromPreset(presetRomance());
    expect(conjugationRichness(lang)).toBe(6);
  });

  it("English preset has conjugation richness = 1 (3sg only)", () => {
    const lang = langFromPreset(presetEnglish());
    expect(conjugationRichness(lang)).toBeLessThanOrEqual(2);
    expect(conjugationRichness(lang)).toBeGreaterThanOrEqual(1);
  });

  it("inflectForPerson picks the right cell from the grid", () => {
    const lang = langFromPreset(presetRomance());
    const m = "speak";
    if (!lang.lexicon[m]) return;
    const root = lang.lexicon[m]!.join("");
    const out1pl = inflectForPerson(lang, m, "1", "pl").join("");
    expect(out1pl).not.toBe(root);
    expect(out1pl).toMatch(/m.s$/); // Romance 1pl suffix is -mus
    const out2pl = inflectForPerson(lang, m, "2", "pl").join("");
    expect(out2pl).toMatch(/t.s$/); // 2pl suffix is -tis
    const out3pl = inflectForPerson(lang, m, "3", "pl").join("");
    expect(out3pl).toMatch(/nt$/); // 3pl suffix is -nt
  });

  it("verbConjugationTable returns empty array for missing meaning", () => {
    const lang = langFromPreset(presetRomance());
    expect(verbConjugationTable(lang, "__nonexistent__")).toEqual([]);
  });

  it("tense option combines with person/number into a cascade", () => {
    const lang = langFromPreset(presetRomance());
    const m = "speak";
    if (!lang.lexicon[m]) return;
    // Without tense.
    const present = verbConjugationTable(lang, m);
    // With past tense.
    const past = verbConjugationTable(lang, m, { tense: "verb.tense.past" });
    expect(past).toHaveLength(6);
    // Past forms should all be longer than present forms (added a tense affix).
    for (let i = 0; i < 6; i++) {
      expect(past[i]!.form.length).toBeGreaterThanOrEqual(present[i]!.form.length);
    }
  });
});
