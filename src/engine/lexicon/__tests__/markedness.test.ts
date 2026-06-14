import { describe, expect, test } from "vitest";
import { presetEnglish } from "../../presets/english";
import { buildInitialState } from "../../steps/init";
import { addSynonym, setLexiconForm } from "../mutate";
import { markednessOf } from "../synonymSelect";

/**
 * markedness.test.ts — G4 Task 1.
 *
 * `markednessOf(lang, meaning, form)` ranks a meaning's forms by how
 * MARKED (rare / register-restricted) they are: lower = more common /
 * unmarked. It blends the form's in-language usage (per-sense weight,
 * the language's OWN frequency signal) with the G1 corpus-rank prior
 * (`rankOf`) — never a hardcoded English judgement.
 */

function freshLang() {
  const cfg = { ...presetEnglish(), seed: "marked-test" };
  const state = buildInitialState(cfg);
  return state.tree[state.rootId]!.language;
}

describe("G4 — markednessOf", () => {
  test("the common high-usage form is less marked than a rare synonym", () => {
    const lang = freshLang();
    // Establish a common primary form for "black" and a rare synonym.
    const common = ["b", "l", "a", "k"];
    const rare = ["s", "w", "a", "r", "θ", "i"];
    setLexiconForm(lang, "black", common, { bornGeneration: 0, weight: 0.9 });
    addSynonym(lang, "black", rare, { bornGeneration: 0, register: "high", weight: 0.1 });

    const mCommon = markednessOf(lang, "black", common);
    const mRare = markednessOf(lang, "black", rare);

    expect(mCommon).toBeLessThan(mRare);
  });

  test("is deterministic — same inputs give the same value", () => {
    const lang = freshLang();
    const common = ["b", "l", "a", "k"];
    setLexiconForm(lang, "black", common, { bornGeneration: 0, weight: 0.9 });
    expect(markednessOf(lang, "black", common)).toBe(markednessOf(lang, "black", common));
  });

  test("corpus-rank prior: a rarer concept is more marked at equal usage", () => {
    const lang = freshLang();
    // "black" (corpus rank 254) is a much more common concept than
    // "swarthy"-like rare concepts; with equal in-language usage the
    // commoner concept should still read as less marked.
    const f = ["x", "x", "x"];
    setLexiconForm(lang, "black", f, { bornGeneration: 0, weight: 0.5 });
    setLexiconForm(lang, "amphora", f.slice(), { bornGeneration: 0, weight: 0.5 });
    const mBlack = markednessOf(lang, "black", f);
    const mAmphora = markednessOf(lang, "amphora", f);
    expect(mBlack).toBeLessThan(mAmphora);
  });
});
