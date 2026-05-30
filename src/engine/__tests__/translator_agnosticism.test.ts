import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetBantu } from "../presets/bantu";
import { presetEnglish } from "../presets/english";
import { presetRomance } from "../presets/romance";
import { translateSentence, type TranslatedToken } from "../translator/sentence";
import type { Language } from "../types";

/**
 * translator_agnosticism.test.ts
 *
 * Language-agnosticism invariant: NP-internal modifier ordering must follow
 * the target language's typology (`grammar.adjectivePosition`,
 * `grammar.possessorPosition`), NOT English word order. Bantu places
 * adjectives and possessors AFTER the head noun; English places them before.
 * Translating the same English input into each must produce opposite orders.
 *
 * (Relative-clause ordering is NOT asserted here — it's a known limitation of
 * the legacy realiser IR; see ROADMAP NEEDS DECISION "Translator realiser
 * refactor".)
 */

function protoOf(build: () => ReturnType<typeof presetBantu>, seed: string): Language {
  return createSimulation({ ...build(), seed }).getState().tree["L-0"]!.language;
}
const idxOf = (toks: TranslatedToken[], lemma: string): number =>
  toks.findIndex((t) => t.englishLemma === lemma);
const surface = (toks: TranslatedToken[]): string =>
  toks.map((t) => t.englishLemma).join(" ");

describe("translator language-agnosticism: modifier ordering follows grammar, not English", () => {
  it("adjective placement follows grammar.adjectivePosition (Bantu post, English pre)", () => {
    for (const [name, build] of [["bantu", presetBantu], ["english", presetEnglish]] as const) {
      const lang = protoOf(build, `agn-adj-${name}`);
      const { targetTokens: t } = translateSentence(lang, "the big king sees the dog");
      const adj = idxOf(t, "big");
      const noun = idxOf(t, "king");
      expect(adj, `${name}: 'big' should resolve in "${surface(t)}"`).toBeGreaterThanOrEqual(0);
      expect(noun, `${name}: 'king' should resolve in "${surface(t)}"`).toBeGreaterThanOrEqual(0);
      if (lang.grammar.adjectivePosition === "post") {
        expect(adj, `${name}: post-adjective → 'big' after 'king' ("${surface(t)}")`).toBeGreaterThan(noun);
      } else {
        expect(adj, `${name}: pre-adjective → 'big' before 'king' ("${surface(t)}")`).toBeLessThan(noun);
      }
    }
  });

  it("possessor placement follows grammar.possessorPosition (Bantu post, English pre)", () => {
    for (const [name, build] of [["bantu", presetBantu], ["english", presetEnglish]] as const) {
      const lang = protoOf(build, `agn-poss-${name}`);
      const { targetTokens: t } = translateSentence(lang, "the king 's dog sees the bird");
      const possessor = idxOf(t, "king");
      const possessed = idxOf(t, "dog");
      expect(possessor, `${name}: 'king' should resolve in "${surface(t)}"`).toBeGreaterThanOrEqual(0);
      expect(possessed, `${name}: 'dog' should resolve in "${surface(t)}"`).toBeGreaterThanOrEqual(0);
      if (lang.grammar.possessorPosition === "post") {
        expect(possessor, `${name}: post-possessor → 'king' after 'dog' ("${surface(t)}")`).toBeGreaterThan(possessed);
      } else {
        expect(possessor, `${name}: pre-possessor → 'king' before 'dog' ("${surface(t)}")`).toBeLessThan(possessed);
      }
    }
  });

  it("numeral placement follows grammar.numeralPosition (pre vs post), independent of adjectivePosition", () => {
    // numeralPosition is its OWN typological axis — it must NOT be conflated
    // with adjectivePosition. Toggle it on one (post-adjective) language and
    // verify the numeral moves accordingly.
    const lang = protoOf(presetBantu, "agn-num");
    for (const pos of ["pre", "post"] as const) {
      lang.grammar.numeralPosition = pos;
      const { targetTokens: t } = translateSentence(lang, "the king sees two dogs");
      const num = idxOf(t, "two");
      const noun = idxOf(t, "dog");
      expect(num, `${pos}: 'two' should resolve in "${surface(t)}"`).toBeGreaterThanOrEqual(0);
      expect(noun, `${pos}: 'dog' should resolve in "${surface(t)}"`).toBeGreaterThanOrEqual(0);
      if (pos === "post") {
        expect(num, `num=post → 'two' after 'dog' ("${surface(t)}")`).toBeGreaterThan(noun);
      } else {
        expect(num, `num=pre → 'two' before 'dog' ("${surface(t)}")`).toBeLessThan(noun);
      }
    }
  });

  it("relativizer-strategy languages place the relative clause postnominally (head before clause)", () => {
    // Relativizer-strategy languages are VO and put the RC after the head noun:
    // "the king who sees the dog" — head, then relativizer, then clause. The
    // RC verb ('see') must therefore follow the head noun ('king'), not precede
    // it (the pre-fix bug rendered Bantu as "see dog who king").
    for (const [name, build] of [["bantu", presetBantu], ["english", presetEnglish]] as const) {
      const lang = protoOf(build, `agn-rc-${name}`);
      if ((lang.grammar.relativeClauseStrategy ?? "relativizer") !== "relativizer") continue;
      const { targetTokens: t } = translateSentence(lang, "the king who sees the dog walks");
      const head = idxOf(t, "king");
      const rcVerb = idxOf(t, "see");
      expect(head, `${name}: 'king' should resolve in "${surface(t)}"`).toBeGreaterThanOrEqual(0);
      expect(rcVerb, `${name}: RC verb 'see' should resolve in "${surface(t)}"`).toBeGreaterThanOrEqual(0);
      expect(head, `${name}: postnominal RC → head 'king' before RC verb 'see' ("${surface(t)}")`).toBeLessThan(rcVerb);
    }
  });

  it("case-strategy languages keep the comparative 'than' particle but still drop plain obliques", () => {
    // Case-strategy languages drop oblique adpositions because the NP's case
    // affix recovers the role. The comparative 'than' is NOT such an adposition:
    // no comparative case marks the standard, so dropping it leaves the
    // comparison unmarked ("king big dog"). It must be retained (particle
    // comparative — Stassen). A plain locative oblique ('in') must STILL drop,
    // confirming the exemption is scoped to the comparative marker only.
    const lang = protoOf(presetRomance, "agn-comparative");
    const cs = lang.grammar.caseStrategy ?? (lang.grammar.hasCase ? "case" : "preposition");
    expect(cs, "Romance proto is case-strategy").toBe("case");

    const comp = translateSentence(lang, "the king is bigger than the dog").targetTokens;
    expect(idxOf(comp, "than"), `comparative 'than' retained ("${surface(comp)}")`).toBeGreaterThanOrEqual(0);

    const loc = translateSentence(lang, "the man sees the dog in the house").targetTokens;
    expect(idxOf(loc, "in"), `plain oblique 'in' still dropped ("${surface(loc)}")`).toBe(-1);
  });

  it("case-strategy languages keep meaning-critical adpositions (privative 'without', comitative 'with')", () => {
    // Abessive/comitative are rare as morphological cases and none is applied to
    // the PP-NP, so dropping "without"/"with" erases meaning ("man without the
    // dog" had collapsed to "man run dog" — a transitive reading). They are
    // retained as particles; spatial obliques (on) still drop.
    const lang = protoOf(presetRomance, "agn-privative");
    const wo = translateSentence(lang, "the man without the dog runs").targetTokens;
    expect(idxOf(wo, "without"), `privative 'without' retained ("${surface(wo)}")`).toBeGreaterThanOrEqual(0);
    const wi = translateSentence(lang, "the man with the dog runs").targetTokens;
    expect(idxOf(wi, "with"), `comitative 'with' retained ("${surface(wi)}")`).toBeGreaterThanOrEqual(0);
    const on = translateSentence(lang, "the dog runs on the mountain").targetTokens;
    expect(idxOf(on, "on"), `spatial 'on' still dropped ("${surface(on)}")`).toBe(-1);
  });

  it("object/oblique pronouns take their suppletive case form (him/me/us, not he/i/we)", () => {
    // The parser canonicalises an object pronoun to its nominative lemma for
    // concept lookup (him→he); in object (O) / oblique (PP-NP) role the realiser
    // must recover the case form so it surfaces correctly (English suppletion;
    // case morphology elsewhere). English has distinct he/him, we/us, i/me.
    const lang = protoOf(presetEnglish, "agn-pron");
    const obj = translateSentence(lang, "the man sees him").targetTokens;
    expect(idxOf(obj, "him"), `object 'him' surfaces ("${surface(obj)}")`).toBeGreaterThanOrEqual(0);
    expect(idxOf(obj, "he"), `nominative 'he' must NOT surface for the object ("${surface(obj)}")`).toBe(-1);

    const dat = translateSentence(lang, "give me the stone").targetTokens;
    expect(idxOf(dat, "me"), `dative 'me' surfaces ("${surface(dat)}")`).toBeGreaterThanOrEqual(0);
    expect(idxOf(dat, "i"), `nominative 'i' must NOT surface for the recipient ("${surface(dat)}")`).toBe(-1);
  });

  it("three-way+ NP coordination keeps every conjunct ('X and Y and Z')", () => {
    // The parser stores flat sibling coordination modifiers (man[coord(woman),
    // coord(child)]) but the legacy NP has a single `coord` field — pre-fix the
    // middle conjunct was overwritten and dropped ("man and woman and child" →
    // "man and child"). The role-IR now nests them so all survive.
    const lang = protoOf(presetEnglish, "agn-coord3");
    const t = translateSentence(lang, "the man and the woman and the child run").targetTokens;
    for (const w of ["man", "woman", "child"]) {
      expect(idxOf(t, w), `conjunct '${w}' surfaces ("${surface(t)}")`).toBeGreaterThanOrEqual(0);
    }
  });

  it("intensified adjective ('very big') is realised by full reduplication", () => {
    // No "very" lexeme exists in the target; intensification surfaces as iconic
    // full reduplication of the adjective (big → big-big). Lexeme-free, emergent.
    const lang = protoOf(presetEnglish, "agn-intens");
    const base = (lang.lexicon["big"] ?? []).join("");
    const toks = translateSentence(lang, "the very big dog runs").targetTokens;
    const adj = toks.find((t) => t.englishLemma === "big");
    expect(base.length, "'big' is lexicalised").toBeGreaterThan(0);
    expect(adj?.targetSurface, `adjective is reduplicated ("${surface(toks)}")`).toBe(base + base);

    // Predicate position too ("the dog is very big") — the copular complement
    // path was dropping "very" + the adjective before the tokenizer fix.
    const pred = translateSentence(lang, "the dog is very big").targetTokens;
    const padj = pred.find((t) => t.englishLemma === "big");
    expect(padj?.targetSurface, `predicate adjective reduplicated ("${surface(pred)}")`).toBe(base + base);
  });

  it("plural pronouns are not re-pluralised by the regular noun-plural affix", () => {
    // "we"/"they"/"us" are suppletive — they lexically encode plural and must
    // not take the noun plural affix ("us" + -s → "ʌss" was the bug). Regular
    // nouns still pluralise — that path is unchanged.
    const lang = protoOf(presetEnglish, "agn-plpron");
    const tok = translateSentence(lang, "we see the dog").targetTokens.find((t) => t.englishLemma === "we");
    expect(tok, "subject pronoun 'we' resolves").toBeDefined();
    expect(tok!.targetSurface, "plural pronoun 'we' is the bare lexical form, not affixed")
      .toBe((lang.lexicon["we"] ?? []).join(""));
  });
});
