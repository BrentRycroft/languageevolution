import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { presetPIE } from "../presets/pie";
import { createSimulation } from "../simulation";
import { setLexiconForm } from "../lexicon/mutate";

/**
 * translator_polish.test.ts
 *
 * Test suite for: "translator polish — predicate adjectives".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function pieLang() {
  const sim = createSimulation(presetPIE());
  sim.step();
  return sim.getState().tree["L-0"]!.language;
}

describe("translator polish — predicate adjectives", () => {
  it("'X is happy' surfaces the predicate adjective", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king is happy");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("happy");
  });

  it("'today was good' surfaces 'good'", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "today was good");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("good");
  });

  it("'the man was not happy' keeps man + not + happy + (be)", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the man was not happy");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("man");
    expect(lemmas).toContain("not");
    expect(lemmas).toContain("happy");
  });

  it("predicate adjective inherits noun-number agreement when subject is plural", () => {
    const lang = pieLang();
    lang.morphology.paradigms["adj.num.pl"] = {
      affix: ["s"],
      position: "suffix",
      category: "adj.num.pl",
    };
    setLexiconForm(lang, "happy", ["w", "e", "l"], { bornGeneration: lang.birthGeneration ?? 0 });
    const out = translateSentence(lang, "the kings are happy");
    const adj = out.targetTokens.find((t) => t.englishLemma === "happy");
    expect(adj?.targetSurface).toMatch(/s$/);
  });
});

describe("translator polish — leading discourse coordinators", () => {
  it("'And he was here' surfaces 'and'", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "and he was here");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("and");
    expect(lemmas).toContain("he");
    expect(lemmas).toContain("here");
  });

  it("'But the king sees' surfaces 'but' before subject", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "but the king sees the wolf");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas[0]).toBe("but");
  });
});

describe("translator polish — object pronouns surface via their oblique form", () => {
  // The object pronoun's FORM resolves via the subject lexeme's stem (no separate
  // "him"/"them" lexicon entry — nothing goes missing), and the English gloss
  // caption is the oblique form ("him"/"them"), matching the realiser's
  // PRONOUN_OBLIQUE captioning (see narrative_composer "oblique caption" test).
  it("'she sees him' glosses the object as 'him' and resolves it (no missing)", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "she sees him");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("him");
    expect(lemmas).toContain("she");
    expect(out.missing).not.toContain("he");
    expect(out.missing).not.toContain("him");
  });

  it("'I see them' glosses the object as 'them' and resolves it (no missing)", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "i see them");
    const lemmas = out.targetTokens.map((t) => t.englishLemma);
    expect(lemmas).toContain("i");
    expect(lemmas).toContain("them");
    expect(out.missing).not.toContain("they");
    expect(out.missing).not.toContain("them");
  });
});

/**
 * Phase 50 T3 + Phase 53 T1: graceful fallback coins ONLY when the
 * candidate form grounds in the language's existing lexicon
 * (compound / derivation / blending / clipping over real lexemes).
 * IDEOPHONE was removed because it generated from raw phoneme
 * inventory without any lexicon basis.
 *
 * Result: lemmas without a lexicon-grounded path now fall through to
 * literal-quote rendering instead of a coined-from-air form. This is
 * the user's explicit requirement — coining only when there's a real
 * etymological tie.
 */
describe("translator polish — unresolved words: coin if grounded, else literal-quote", () => {
  it("an unresolvable lemma either coins (when grounded) or quotes (when not)", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the dragon eats the king");
    const dragon = out.targetTokens.find((t) => t.englishLemma === "dragon");
    expect(dragon).toBeDefined();
    // Either grounded coinage (synth-fallback) or literal-quote
    // (fallback). Both are valid Phase-53 outcomes; the wrong outcome
    // would be coinage WITHOUT a lexicon-grounded etymology, which
    // this test trusts the gracefulFallback grounding check to prevent.
    expect(["synth-fallback", "fallback"]).toContain(dragon!.resolution);
    if (dragon!.resolution === "synth-fallback") {
      expect(dragon!.targetSurface).not.toContain("“");
    }
  });

  it("missing verb either coins or quotes", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the spaceship lands on the moon");
    const land = out.targetTokens.find((t) => t.englishLemma === "land");
    expect(land).toBeDefined();
    expect(["synth-fallback", "fallback"]).toContain(land!.resolution);
  });

  it("missing adjective either coins or quotes", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the wise king sees");
    const wise = out.targetTokens.find((t) => t.englishLemma === "wise");
    expect(wise).toBeDefined();
    expect(["synth-fallback", "fallback"]).toContain(wise!.resolution);
  });

  it("missing predicate adjective coins, quotes, or grounds via colexification", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king is angry");
    const angry = out.targetTokens.find((t) => t.englishLemma === "angry");
    expect(angry).toBeDefined();
    // Vector-native flip: "angry" gained a real GloVe anchor (anchor-coverage extras), so the
    // translator can now GROUND it to a semantically-near existing word (colex) rather than only
    // coining or literal-quoting — a strictly better resolution path for a word with a real point.
    expect(["synth-fallback", "fallback", "colex"]).toContain(angry!.resolution);
  });
});

describe("translator polish — irregular plurals", () => {
  it("'wolves' strips to 'wolf' so it resolves", () => {
    const lang = pieLang();
    const out = translateSentence(lang, "the king sees the wolves");
    const wolf = out.targetTokens.find((t) => t.englishLemma === "wolf");
    expect(wolf).toBeDefined();
    expect(out.missing).not.toContain("wolve");
    expect(out.missing).not.toContain("wolves");
  });
});
