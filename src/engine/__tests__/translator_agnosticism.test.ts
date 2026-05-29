import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetBantu } from "../presets/bantu";
import { presetEnglish } from "../presets/english";
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

  it("numeral placement follows the language's modifier order (Bantu post, English pre)", () => {
    for (const [name, build] of [["bantu", presetBantu], ["english", presetEnglish]] as const) {
      const lang = protoOf(build, `agn-num-${name}`);
      const { targetTokens: t } = translateSentence(lang, "the king sees two dogs");
      const num = idxOf(t, "two");
      const noun = idxOf(t, "dog");
      expect(num, `${name}: 'two' should resolve in "${surface(t)}"`).toBeGreaterThanOrEqual(0);
      expect(noun, `${name}: 'dog' should resolve in "${surface(t)}"`).toBeGreaterThanOrEqual(0);
      if (lang.grammar.adjectivePosition === "post") {
        expect(num, `${name}: post-modifier → numeral 'two' after noun 'dog' ("${surface(t)}")`).toBeGreaterThan(noun);
      } else {
        expect(num, `${name}: pre-modifier → numeral 'two' before noun 'dog' ("${surface(t)}")`).toBeLessThan(noun);
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
});
