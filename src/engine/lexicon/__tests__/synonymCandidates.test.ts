import { describe, expect, test } from "vitest";
import { presetEnglish } from "../../presets/english";
import { buildInitialState } from "../../steps/init";
import { addSynonym, setLexiconForm } from "../mutate";
import { satSet } from "../satellites";
import { formKeyOf } from "../word";
import { synonymCandidates } from "../synonymSelect";

/**
 * synonymCandidates.test.ts — G4 Task 2.
 *
 * The candidate set for a meaning is broadened beyond Phase-37 spawned
 * synonyms to include: tight geometric near-synonyms (forms the language
 * already uses for geometrically-close concepts) and recorded
 * colexification partners. All deduped by form-key.
 */

function freshLang() {
  const cfg = { ...presetEnglish(), seed: "syn-cand-test" };
  const state = buildInitialState(cfg);
  return state.tree[state.rootId]!.language;
}

describe("G4 — synonymCandidates", () => {
  test("includes the Phase-37 spawned synonym for a meaning", () => {
    const lang = freshLang();
    const rare = ["s", "w", "a", "r", "θ", "i"];
    setLexiconForm(lang, "black", ["b", "l", "a", "k"], { bornGeneration: 0, weight: 0.9 });
    addSynonym(lang, "black", rare, { bornGeneration: 0, register: "high", weight: 0.2 });
    const cands = synonymCandidates(lang, "black").map(formKeyOf);
    expect(cands).toContain(formKeyOf(rare));
  });

  test("includes a recorded colexification partner's form", () => {
    const lang = freshLang();
    // Give a distinctive form to a partner concept and record the colexification.
    const partnerForm = ["z", "z", "z", "q"];
    setLexiconForm(lang, "raven", partnerForm, { bornGeneration: 0, weight: 0.4 });
    satSet(lang, "colexifiedAs", "black", ["raven"]);
    const cands = synonymCandidates(lang, "black").map(formKeyOf);
    expect(cands).toContain(formKeyOf(partnerForm));
  });

  test("dedupes — the primary form appears once", () => {
    const lang = freshLang();
    const cands = synonymCandidates(lang, "black").map(formKeyOf);
    const unique = new Set(cands);
    expect(unique.size).toBe(cands.length);
  });
});
