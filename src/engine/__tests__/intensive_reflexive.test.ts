import { describe, it, expect } from "vitest";
import { tokeniseEnglish, translateSentence } from "../translator/sentence";
import { parseSyntaxToClause } from "../translator/parse";
import { presetPIE } from "../presets/pie";
import { presetRomance } from "../presets/romance";
import { createSimulation } from "../simulation";
import type { RoleClause } from "../translator/syntax";
import type { SimulationConfig } from "../types";

/**
 * intensive_reflexive.test.ts
 *
 * Intensive/emphatic (adnominal) reflexive vs reflexive anaphor
 * (König & Siemund). "the man HIMSELF runs" — "himself" emphasises the
 * subject NP and is an adjunct, NOT an argument: the subject "man" must
 * survive. "the man sees himself" — "himself" is the reflexive object
 * (argument), co-referent with the subject; that path must stay intact.
 */

function parse(s: string): RoleClause {
  const rc = parseSyntaxToClause(tokeniseEnglish(s));
  if (!rc) throw new Error(`parser returned null for: ${s}`);
  return rc;
}

function langOf(cfg: SimulationConfig) {
  const sim = createSimulation(cfg);
  sim.step();
  return sim.getState().tree["L-0"]!.language;
}

describe("intensive/emphatic reflexive drops nothing (parse level)", () => {
  it("'the man himself runs' keeps subject 'man' + emphatic adjunct, not an argument", () => {
    const rc = parse("the man himself runs");
    const cores = rc.participants.filter((p) => !p.adjunct);
    // Exactly one core argument — the subject. "himself" is NOT a second argument.
    expect(cores).toHaveLength(1);
    const subject = cores[0]!;
    expect(subject.lemma).toBe("man");
    expect(rc.predicate.lemma).toBe("run");
    // "himself" attaches as an emphatic modifier on the subject NP.
    const emph = (subject.modifiers ?? []).find((m) => m.kind === "emphatic");
    expect(emph, "intensive 'himself' must attach as an emphatic adjunct").toBeDefined();
    // The subject is not "himself" and "himself" is not a standalone participant.
    expect(rc.participants.some((p) => p.lemma === "himself")).toBe(false);
  });

  it("'the man sees himself' still parses 'himself' as the reflexive OBJECT", () => {
    const rc = parse("the man sees himself");
    const cores = rc.participants.filter((p) => !p.adjunct);
    expect(cores).toHaveLength(2);
    const subject = cores[0]!;
    const object = cores[1]!;
    expect(subject.lemma).toBe("man");
    expect(object.lemma).toBe("himself");
    // No emphatic modifier in the anaphor construction.
    expect((subject.modifiers ?? []).some((m) => m.kind === "emphatic")).toBe(false);
  });
});

describe("intensive reflexive — subject survives end-to-end (PIE SOV + Romance SVO)", () => {
  for (const [name, cfg] of [
    ["PIE", presetPIE()],
    ["Romance", presetRomance()],
  ] as const) {
    it(`${name}: 'the man himself runs' keeps the subject 'man' and the verb 'run'`, () => {
      const lang = langOf(cfg);
      const lemmas = translateSentence(lang, "the man himself runs").targetTokens.map(
        (t) => t.englishLemma,
      );
      expect(lemmas, "subject 'man' must survive").toContain("man");
      expect(lemmas, "verb 'run' must survive").toContain("run");
    });

    it(`${name}: 'the man sees himself' keeps subject 'man' (reflexive-object path intact)`, () => {
      const lang = langOf(cfg);
      const lemmas = translateSentence(lang, "the man sees himself").targetTokens.map(
        (t) => t.englishLemma,
      );
      expect(lemmas).toContain("man");
      expect(lemmas).toContain("see");
    });
  }
});
