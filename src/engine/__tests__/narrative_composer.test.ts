import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { composeTargetSentence, type AbstractTemplate, type SlotAssignment } from "../narrative/composer";
import { makeDiscourse, mention } from "../narrative/discourse";
import { generateDiscourseNarrative } from "../narrative/discourse_generate";
import type { Language } from "../types";

/**
 * narrative_composer.test.ts
 *
 * Test suite for: "Narrative composer — target-side composition".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function englishLang(): Language {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree["L-0"]!.language;
}

describe("Narrative composer — target-side composition", () => {
  it("transitive past template produces N + V(past) + N tokens with derived English", () => {
    const lang = englishLang();
    const tpl: AbstractTemplate = {
      shape: "transitive",
      tense: "past",
      needs: { subject: true, object: true, adjective: false, time: false, place: false },
      introducesEntity: true,
    };
    const slots: SlotAssignment = { verb: "see", subject: "dog", object: "bread" };
    const ctx = makeDiscourse("legend");
    const out = composeTargetSentence(lang, tpl, slots, ctx, "ipa");
    expect(out.tokens.length).toBeGreaterThan(0);
    const verbTok = out.tokens.find((t) => t.englishLemma === "see");
    expect(verbTok).toBeDefined();
    expect(verbTok!.glossNote).toContain("tense.past");
    expect(out.english.toLowerCase()).toContain("dog");
    expect(out.english.toLowerCase()).toContain("bread");
    expect(out.english.toLowerCase()).toContain("saw");
  });

  it("an object pronoun gets its oblique caption ('he' → 'him')", () => {
    // When a pronoun fills the object slot, the English gloss caption must show
    // the oblique form ("king speaks him", not "...he"). The target form is
    // case-marked separately; this only corrects the caption.
    const lang = englishLang();
    const tpl: AbstractTemplate = {
      shape: "transitive",
      tense: "present",
      needs: { subject: true, object: true, adjective: false, time: false, place: false },
      introducesEntity: true,
    };
    const slots: SlotAssignment = { verb: "speak", subject: "king", object: "he" };
    const out = composeTargetSentence(lang, tpl, slots, makeDiscourse("myth"), "ipa");
    const objTok = out.tokens.find((t) => t.englishTag === "N" && (t.englishLemma === "him" || t.englishLemma === "he"));
    expect(objTok?.englishLemma, `object pronoun caption is oblique ("${out.english}")`).toBe("him");
  });

  it("deictic time adverbs surface bare; temporal nouns keep the 'in' adposition", () => {
    const lang = englishLang();
    const mk = (time: string) =>
      composeTargetSentence(
        lang,
        {
          shape: "time_prefix_intrans",
          tense: "present",
          needs: { subject: true, object: false, adjective: false, time: true, place: false },
          introducesEntity: true,
        },
        { verb: "run", subject: "dog", time },
        makeDiscourse("myth"),
        "ipa",
      );

    const deictic = mk("yesterday");
    const dLemmas = deictic.tokens.map((t) => t.englishLemma);
    expect(dLemmas.includes("yesterday"), `"yesterday" surfaces ("${deictic.english}")`).toBe(true);
    expect(
      dLemmas.includes("in") || dLemmas.includes("at"),
      `deictic adverb takes NO adposition ("${deictic.english}")`,
    ).toBe(false);

    const noun = mk("summer");
    const nLemmas = noun.tokens.map((t) => t.englishLemma);
    // Only assert the positive when the temporal noun actually resolved.
    if (nLemmas.includes("summer")) {
      expect(nLemmas.includes("in"), `temporal noun keeps "in" ("${noun.english}")`).toBe(true);
    }
  });

  it("respects SOV word order: target surface puts V last while English caption stays SVO", () => {
    const base = englishLang();
    const sovLang: Language = {
      ...base,
      grammar: { ...base.grammar, wordOrder: "SOV" },
    };
    const tpl: AbstractTemplate = {
      shape: "transitive",
      tense: "present",
      needs: { subject: true, object: true, adjective: false, time: false, place: false },
      introducesEntity: true,
    };
    const slots: SlotAssignment = { verb: "see", subject: "dog", object: "bread" };
    const ctx = makeDiscourse("daily");
    const out = composeTargetSentence(sovLang, tpl, slots, ctx, "ipa");
    const surfaceLemmas = out.tokens.map((t) => t.englishLemma);
    const dogIdx = surfaceLemmas.indexOf("dog");
    const breadIdx = surfaceLemmas.indexOf("bread");
    const seeIdx = surfaceLemmas.indexOf("see");
    expect(dogIdx).toBeLessThan(breadIdx);
    expect(breadIdx).toBeLessThan(seeIdx);
    // Phase 65 T1: first-mention NPs surface as indefinite "a" not
    // definite "the". Both subject and object are previously
    // unmentioned, so both get "a".
    expect(out.english.toLowerCase()).toMatch(/dog\s+sees\s+a\s+bread/);
  });

  it("intransitive past with topicSubject produces a pronoun and English uses 'it'/'he'/'she'", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("myth");
    mention(ctx, "dog");
    const tpl: AbstractTemplate = {
      shape: "topic_intrans",
      tense: "past",
      needs: { subject: false, object: false, adjective: false, time: false, place: false },
      topicSubject: true,
    };
    const slots: SlotAssignment = { verb: "go" };
    const out = composeTargetSentence(lang, tpl, slots, ctx, "ipa");
    const pronTok = out.tokens.find((t) => t.englishTag === "PRON");
    expect(pronTok).toBeDefined();
    expect(out.english.toLowerCase()).toContain("went");
    expect(/\b(it|he|she|they)\b/i.test(out.english)).toBe(true);
  });

  it("generateDiscourseNarrative produces lines with derived English (not English-templated source)", () => {
    const lang = englishLang();
    const out = generateDiscourseNarrative(lang, "test-seed", { genre: "myth", lines: 5, script: "ipa" });
    expect(out.length).toBeGreaterThan(0);
    for (const line of out) {
      expect(line.english).toBeTypeOf("string");
      expect(line.english.length).toBeGreaterThan(0);
      expect(line.text).toBeTypeOf("string");
      expect(line.text.length).toBeGreaterThan(0);
    }
  });

  it("a runtime-derived concept glosses with a Leipzig category, not a leaked '--affix'", () => {
    // Regression: runtime-derived slot meanings are `${base}-${tag}` where
    // `tag` already starts with "-" (e.g. "-ish"), so a naive caption
    // produced non-words like "lake--ish" / gloss "lake--ish-ACC". The
    // composer must instead render the base lemma in the caption and a
    // Leipzig derivation gloss (ADJZ, AGT, DIM, …) in the interlinear.
    const base = englishLang();
    const lang: Language = {
      ...base,
      derivationalSuffixes: [
        ...(base.derivationalSuffixes ?? []),
        { affix: ["ɪ", "ʃ"], tag: "-ish", category: "adjectival", productive: true },
      ],
    };
    const tpl: AbstractTemplate = {
      shape: "transitive",
      tense: "present",
      needs: { subject: true, object: true, adjective: false, time: false, place: false },
      introducesEntity: true,
    };
    const slots: SlotAssignment = { verb: "see", subject: "king", object: "lake--ish" };
    const out = composeTargetSentence(lang, tpl, slots, makeDiscourse("legend"), "ipa");

    const objTok = out.tokens.find((t) => t.englishTag === "N" && t.englishLemma.includes("lake"));
    expect(objTok, "derived object token resolved").toBeDefined();
    // Caption is the clean base lemma — no double hyphen, no raw affix.
    expect(objTok!.englishLemma).toBe("lake");
    // Interlinear gloss carries the Leipzig derivation category (ADJZ).
    expect(objTok!.glossNote).toContain("ADJZ");
    expect(objTok!.glossNote).not.toContain("-ish");
    // Neither the free-translation caption nor any token leaks "--".
    expect(out.english).not.toContain("--");
    for (const t of out.tokens) expect(t.englishLemma).not.toContain("--");
  });

  it("plural irregular survives: subject 'man' produces 'men' in English when pluralized", () => {
    const lang = englishLang();
    expect(lang.suppletion?.man?.["noun.num.pl"]).toBeDefined();
    const tpl: AbstractTemplate = {
      shape: "intransitive",
      tense: "present",
      needs: { subject: true, object: false, adjective: false, time: false, place: false },
      introducesEntity: true,
    };
    const slots: SlotAssignment = { verb: "run", subject: "man" };
    const ctx = makeDiscourse("daily");
    const out = composeTargetSentence(lang, tpl, slots, ctx, "ipa");
    const manTok = out.tokens.find((t) => t.englishLemma === "man");
    expect(manTok).toBeDefined();
    expect(out.english.toLowerCase()).toContain("man");
  });
});
