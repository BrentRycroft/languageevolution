import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { presetEnglish } from "../presets/english";
import { presetTokipona } from "../presets/tokipona";
import { presetBantu } from "../presets/bantu";
import { createSimulation } from "../simulation";
import { leafIds } from "../tree/split";
import { setLexiconForm, deleteMeaning } from "../lexicon/mutate";
import { formKeyOf } from "../lexicon/word";
import type { Language } from "../types";

/**
 * Phase 29 Tranche 7b: cross-system invariants enforced via property
 * tests. These lock in the contracts that Tranche 1 (kill dual-truth)
 * established:
 *
 *   - Every meaning in `lang.lexicon` round-trips through `lang.words`.
 *   - `setLexiconForm` and `deleteMeaning` keep the meaning-keyed and
 *     form-keyed views in agreement.
 *   - `MAX_EVENTS_PER_LANGUAGE` is never exceeded post-mutation.
 *
 * If any future patch reintroduces a direct `lang.lexicon[m] = …`
 * outside the chokepoint, one of these will fail.
 */

function freshLang(): Language {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

function aliveLeavesOf(buildPreset: () => ReturnType<typeof presetEnglish>): {
  langs: Language[];
} {
  const sim = createSimulation(buildPreset());
  for (let i = 0; i < 30; i++) sim.step();
  const state = sim.getState();
  const langs: Language[] = [];
  for (const id of leafIds(state.tree)) {
    const node = state.tree[id]!;
    if (!node.language.extinct) langs.push(node.language);
  }
  return { langs };
}

function lexiconAgreesWithWords(lang: Language): { ok: true } | { ok: false; meaning?: string; reason: string } {
  if (!lang.words) return { ok: true }; // pre-migration save
  for (const m of Object.keys(lang.lexicon)) {
    const form = lang.lexicon[m];
    if (!form) continue;
    const key = formKeyOf(form);
    const matchingWord = lang.words.find((w) => w.formKey === key);
    if (!matchingWord) {
      return {
        ok: false,
        meaning: m,
        reason: `lexicon[${m}] = ${key} but no word in lang.words has that formKey`,
      };
    }
    const carriesSense = matchingWord.senses.some((s) => s.meaning === m);
    if (!carriesSense) {
      return {
        ok: false,
        meaning: m,
        reason: `word with formKey ${key} exists but doesn't carry sense ${m}`,
      };
    }
  }
  return { ok: true };
}

describe("Phase 29 Tranche 7b — cross-system invariants", () => {
  it("setLexiconForm preserves the lexicon ↔ words agreement under arbitrary writes", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            meaning: fc.constantFrom("water", "fire", "stone", "tree", "wolf", "bird"),
            form: fc.array(fc.constantFrom("a", "e", "i", "o", "p", "t", "k", "m", "n", "s"), { minLength: 2, maxLength: 6 }),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (writes) => {
          const lang = freshLang();
          for (const w of writes) {
            setLexiconForm(lang, w.meaning, w.form, { bornGeneration: 0, origin: "fc-test" });
            const check = lexiconAgreesWithWords(lang);
            if (!check.ok) {
              throw new Error(`After writing ${JSON.stringify(w)}: ${check.reason}`);
            }
          }
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });

  it("deleteMeaning leaves no orphan word entries pointing at the dead meaning", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom("water", "fire", "stone", "tree", "wolf", "bird", "child", "father"),
          { minLength: 1, maxLength: 6 },
        ),
        (meanings) => {
          const lang = freshLang();
          for (const m of meanings) {
            deleteMeaning(lang, m);
            // After delete, the meaning is gone everywhere.
            if (lang.lexicon[m]) return false;
            if (lang.wordFrequencyHints[m] !== undefined) return false;
            if (lang.wordOrigin[m] !== undefined) return false;
            if (lang.lastChangeGeneration[m] !== undefined) return false;
            if (lang.words) {
              for (const w of lang.words) {
                if (w.senses.some((s) => s.meaning === m)) return false;
              }
            }
          }
          return true;
        },
      ),
      { numRuns: 30 },
    );
  });

  it("a fresh language built from a preset has lexicon ↔ words in agreement", () => {
    for (const buildPreset of [presetEnglish, presetTokipona, presetBantu]) {
      const sim = createSimulation(buildPreset());
      const root = sim.getState().tree[sim.getState().rootId]!.language;
      const check = lexiconAgreesWithWords(root);
      expect(check.ok, check.ok ? "" : `${root.name}: ${check.reason}`).toBe(true);
    }
  });

  // Phase 29 Tranche 7b: previously OPEN (mid-gen desync from
  // prunePhonemes' direct lexicon writes). Closed by adding an
  // end-of-step syncWordsAfterPhonology in stepInventoryManagement.
  // Re-enabling the assertion required also bounding
  // applyOneRegularChange's per-meaning safety loop (was
  // `safety < form.length`, which grew with the form when an
  // insertion-style rule fired and looped infinitely under certain
  // late-generation states).

  it("a 30-gen English run leaves every leaf's lexicon ↔ words in agreement", () => {
    const { langs } = aliveLeavesOf(presetEnglish);
    expect(langs.length).toBeGreaterThan(0);
    for (const lang of langs) {
      const check = lexiconAgreesWithWords(lang);
      expect(check.ok, check.ok ? "" : `${lang.name}: ${check.reason}`).toBe(true);
    }
  });

  it("a 30-gen Tokipona run leaves every leaf's lexicon ↔ words in agreement", () => {
    const { langs } = aliveLeavesOf(presetTokipona);
    expect(langs.length).toBeGreaterThan(0);
    for (const lang of langs) {
      const check = lexiconAgreesWithWords(lang);
      expect(check.ok, check.ok ? "" : `${lang.name}: ${check.reason}`).toBe(true);
    }
  });

  it("a 30-gen Bantu run leaves every leaf's lexicon ↔ words in agreement", () => {
    const { langs } = aliveLeavesOf(presetBantu);
    expect(langs.length).toBeGreaterThan(0);
    for (const lang of langs) {
      const check = lexiconAgreesWithWords(lang);
      expect(check.ok, check.ok ? "" : `${lang.name}: ${check.reason}`).toBe(true);
    }
  });

  it("event log never exceeds MAX_EVENTS_PER_LANGUAGE", async () => {
    const { MAX_EVENTS_PER_LANGUAGE } = await import("../constants");
    const { langs } = aliveLeavesOf(presetEnglish);
    for (const lang of langs) {
      expect(
        lang.events.length,
        `${lang.name}: ${lang.events.length} events`,
      ).toBeLessThanOrEqual(MAX_EVENTS_PER_LANGUAGE);
    }
  });
});
