import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { tokeniseEnglish } from "../translator/sentence";
import { parseSyntaxToClause } from "../translator/parse";
import { realiseSentence } from "../translator/realise";
import { roleClauseToSentence } from "../translator/ast";
import type { Language } from "../types";
import { tForm as lexGet } from "../lexicon/__tests__/glossSeam";

/**
 * G3 — holistic polysynthesis (the one display-only axis the G3 audit found).
 *
 * A language is LABELLED polysynthetic once `grammar.synthesisIndex >= 3.0`
 * (the same threshold `recomputeMorphologicalType` uses), but before this the
 * realiser did not pack the clause into a single verbal word: it incorporated a
 * bare object root but did NOT additionally stack pronominal OBJECT agreement.
 * This locks the fix — at a high synthesis index the verb stacks object agreement
 * (alongside the existing subject agreement + incorporation + TAM) and the overt
 * object pronoun is absorbed, so a transitive clause realises holistically. Driven
 * entirely by the language's own `synthesisIndex` + whichever `verb.obj.*`
 * paradigm it actually carries (capped — no invented morphology).
 */

function freshLang(seed: string): Language {
  const sim = createSimulation({ ...defaultConfig(), seed });
  return sim.getState().tree[sim.getState().rootId]!.language;
}

function realise(lang: Language, sentence: ReturnType<typeof roleClauseToSentence>) {
  return realiseSentence(sentence!, lang, {
    resolveOpen: (lemma: string) => {
      const f = lexGet(lang, lemma);
      return { form: f ?? null, resolution: f ? "direct" : "fallback" };
    },
  });
}

function transitivePronounObjectClause() {
  const clause = parseSyntaxToClause(tokeniseEnglish("the king sees us"))!;
  const sentence = roleClauseToSentence(clause)!;
  // The object is the 1pl pronoun "us".
  sentence.predicate.object!.head.person = "1";
  sentence.predicate.object!.head.number = "pl";
  sentence.predicate.object!.head.isPronoun = true;
  return sentence;
}

describe("G3 — holistic polysynthesis (object agreement on the verb)", () => {
  it("at synthesisIndex >= 3.0 the verb stacks object agreement and drops the overt object pronoun", () => {
    const lang = freshLang("g3-polysynth");
    lang.grammar.synthesisIndex = 3.5; // polysynthetic
    lang.morphology.paradigms["verb.obj.1pl"] = {
      affix: ["o", "s"], position: "suffix", category: "verb.obj.1pl",
    };
    const tokens = realise(lang, transitivePronounObjectClause());
    // Holistic: the object pronoun is absorbed into the verb — no separate O token.
    expect(tokens.some((t) => t.role === "O")).toBe(false);
    // The verb carries the object-agreement affix.
    const verb = tokens.find((t) => t.role === "V");
    expect(verb).toBeDefined();
    expect(verb!.surface.includes("os")).toBe(true);
  });

  it("below the polysynthetic threshold the same clause keeps the overt object pronoun", () => {
    const lang = freshLang("g3-isolating");
    lang.grammar.synthesisIndex = 2.0; // below 3.0 → not polysynthetic
    lang.morphology.paradigms["verb.obj.1pl"] = {
      affix: ["o", "s"], position: "suffix", category: "verb.obj.1pl",
    };
    const tokens = realise(lang, transitivePronounObjectClause());
    // Not polysynthetic: the object pronoun is realised as its own token.
    expect(tokens.some((t) => t.role === "O")).toBe(true);
  });

  it("a polysynthetic language without the object paradigm does not invent morphology", () => {
    const lang = freshLang("g3-no-paradigm");
    lang.grammar.synthesisIndex = 3.5; // polysynthetic, but no verb.obj.* paradigm
    const tokens = realise(lang, transitivePronounObjectClause());
    // Capped by paradigm availability: with no object paradigm the pronoun is
    // NOT silently dropped (no invented agreement) — it surfaces as its own token.
    expect(tokens.some((t) => t.role === "O")).toBe(true);
  });
});
