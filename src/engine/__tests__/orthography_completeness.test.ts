import { describe, it, expect } from "vitest";
import { romanize } from "../phonology/orthography";
import { PHONE_FEATURES } from "../phonology/features";
import { VOWELS, CONSONANTS } from "../phonology/ipa";
import { tEntries as lexEntries } from "../lexicon/__tests__/glossSeam";
import { leafIds } from "../tree/split";
import { createSimulation } from "../simulation";
import { PRESETS } from "../presets";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import type { Language, Phoneme } from "../types";

/**
 * orthography_completeness.test.ts
 *
 * Lane I (2026-06): the romanizer used to romanize phoneme-by-phoneme
 * and DROP any segment with no entry in its IPA→display map (long
 * vowels like /əː/, the IPA-2020 cardinals, etc.). sanitizeLatin then
 * deleted the raw IPA glyph → EMPTY surface forms → words vanished from
 * the UI. These tests pin the invariant: every phoneme romanizes to a
 * non-empty glyph, and no word in a real run renders empty.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function bareLang(overrides: Partial<Language> = {}): Language {
  return {
    id: "L-0",
    name: "Proto",
    lexemes: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    ...overrides,
  };
}

describe("orthography completeness", () => {
  it("every features.ts phoneme romanizes to a non-empty glyph", () => {
    const lang = bareLang();
    const all = new Set<Phoneme>([
      ...(Object.keys(PHONE_FEATURES) as Phoneme[]),
      ...(Array.from(VOWELS) as Phoneme[]),
      ...(Array.from(CONSONANTS) as Phoneme[]),
    ]);
    // Length-marked variant of every vowel — the original bug.
    for (const [p, f] of Object.entries(PHONE_FEATURES)) {
      if (f.type === "vowel") all.add((p + "ː") as Phoneme);
    }

    const empties: Phoneme[] = [];
    for (const p of all) {
      if (romanize([p], lang).length === 0) empties.push(p);
    }
    expect(empties).toEqual([]);
  });

  it("long schwa and other length-marked vowels never vanish", () => {
    const lang = bareLang();
    // Regression for the user-reported bug: /kʰ əː t/ used to render
    // "kt" (long schwa dropped) and /θ əː/ used to render "th".
    expect(romanize(["k", "əː", "t"], lang)).not.toBe("kt");
    expect(romanize(["k", "əː", "t"], lang).length).toBeGreaterThan(2);
    expect(romanize(["θ", "əː"], lang).length).toBeGreaterThan(2);
    // Vowel-initial and vowel-final long-vowel forms must surface a char.
    expect(romanize(["əː", "m"], lang).length).toBeGreaterThan(1);
    expect(romanize(["m", "əː"], lang).length).toBeGreaterThan(1);
    expect(romanize(["ɛː"], lang).length).toBeGreaterThan(0);
  });

  it("no word in a sample run renders empty", () => {
    for (const preset of PRESETS) {
      const sim = createSimulation({ ...preset.build(), seed: `roman-${preset.id}` });
      for (let i = 0; i < 30; i++) sim.step();
      const state = sim.getState();
      const alive = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
      for (const id of alive) {
        const lang = state.tree[id]!.language;
        for (const [meaning, form] of lexEntries(lang)) {
          if (form.length === 0) continue; // empty phoneme form is not orthography's concern
          const r = romanize(form, lang, meaning);
          expect(
            r.length,
            `empty surface form: preset=${preset.id} lang=${id} meaning=${meaning} form=${form.join("")}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });
});
