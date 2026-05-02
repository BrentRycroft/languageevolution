import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { composeTargetSentence, type AbstractTemplate, type SlotAssignment } from "../narrative/composer";
import { makeDiscourse, mention } from "../narrative/discourse";
import { generateDiscourseNarrative } from "../narrative/discourse_generate";
import type { Language } from "../types";

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
    expect(out.english.toLowerCase()).toMatch(/dog\s+sees\s+the\s+bread/);
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
