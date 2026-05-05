import { describe, expect, test } from "vitest";
import { presetEnglish } from "../presets/english";
import { buildInitialState } from "../steps/init";
import { addSynonym, removeSynonym, setLexiconForm } from "../lexicon/mutate";
import { selectSynonyms, findWordsByMeaning, findPrimaryWordForMeaning, formKeyOf } from "../lexicon/word";

function freshLang() {
  const cfg = { ...presetEnglish(), seed: "syn-test" };
  const state = buildInitialState(cfg);
  return state.tree[state.rootId]!.language;
}

describe("Phase 37 — bidirectional word ↔ meaning mapping", () => {
  test("addSynonym attaches a new form to an existing meaning without overwriting primary", () => {
    const lang = freshLang();
    const primary = lang.lexicon["water"]!;
    const ok = addSynonym(lang, "water", ["aː", "k", "w", "a"], { bornGeneration: 0 });
    expect(ok).toBe(true);
    expect(lang.lexicon["water"]).toEqual(primary);
    const forms = selectSynonyms(lang, "water");
    expect(forms.length).toBeGreaterThanOrEqual(2);
    expect(forms[0]?.formKey).toBe(formKeyOf(primary));
  });

  test("addSynonym is idempotent for duplicate (meaning, form)", () => {
    const lang = freshLang();
    addSynonym(lang, "water", ["aː", "k", "w", "a"], { bornGeneration: 0 });
    const ok = addSynonym(lang, "water", ["aː", "k", "w", "a"], { bornGeneration: 1 });
    expect(ok).toBe(false);
    expect(selectSynonyms(lang, "water").length).toBe(2);
  });

  test("addSynonym refuses to register a form identical to the primary", () => {
    const lang = freshLang();
    const primary = lang.lexicon["water"]!;
    const ok = addSynonym(lang, "water", primary.slice(), { bornGeneration: 0 });
    expect(ok).toBe(false);
  });

  test("findPrimaryWordForMeaning skips synonym senses", () => {
    const lang = freshLang();
    const primaryWord = findPrimaryWordForMeaning(lang, "water");
    expect(primaryWord?.formKey).toBe(formKeyOf(lang.lexicon["water"]!));
    addSynonym(lang, "water", ["aː", "k", "w", "a"], { bornGeneration: 0 });
    // Still returns the same primary, not the synonym word.
    const after = findPrimaryWordForMeaning(lang, "water");
    expect(after?.formKey).toBe(formKeyOf(lang.lexicon["water"]!));
  });

  test("removeSynonym drops the synonym; primary remains", () => {
    const lang = freshLang();
    addSynonym(lang, "water", ["aː", "k", "w", "a"], { bornGeneration: 0 });
    expect(selectSynonyms(lang, "water").length).toBe(2);
    removeSynonym(lang, "water", ["aː", "k", "w", "a"]);
    expect(selectSynonyms(lang, "water").length).toBe(1);
    expect(lang.lexicon["water"]).toBeDefined();
  });

  test("homonymy (same form, two meanings) coexists with synonymy", () => {
    const lang = freshLang();
    // Make /bænk/ a homonym for both bank.financial and bank.river,
    // and add a synonym for bank.river.
    setLexiconForm(lang, "bank.financial", ["b", "æ", "n", "k"], { bornGeneration: 0 });
    setLexiconForm(lang, "bank.river", ["b", "æ", "n", "k"], { bornGeneration: 0 });
    addSynonym(lang, "bank.river", ["ʃ", "ɔː", "r"], { bornGeneration: 0 });
    expect(findWordsByMeaning(lang, "bank.river").length).toBe(2); // homonym word + synonym word
    const forms = selectSynonyms(lang, "bank.river");
    expect(forms.length).toBe(2);
  });
});
