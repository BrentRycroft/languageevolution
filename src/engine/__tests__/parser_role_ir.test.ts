import { describe, it, expect } from "vitest";
import { tokeniseEnglish } from "../translator/sentence";
import {
  parseSyntaxToClause,
  parseSyntaxAllAsClauses,
} from "../translator/parse";
import type { Participant, RoleClause } from "../translator/syntax";

/**
 * Phase 73c Tier C Phase 3 — parser emits Role-IR.
 *
 * `parseSyntaxToClause` is the canonical entry point that builds
 * a `RoleClause` directly from English tokens; the legacy
 * `parseSyntax(): Sentence` is now a thin wrapper that pipes
 * through `roleClauseToSentence`.
 *
 * This test pins the RoleClause shape produced for ~20 English
 * inputs covering the core constructs:
 *   - transitive + intransitive
 *   - relative clauses (who / that / which) attached via
 *     `Participant.modifiers[kind: "relative"]`
 *   - NP coordination ("X and Y") via
 *     `Participant.modifiers[kind: "coordination"]`
 *   - S-coordination via `RoleClause.coordinatedWith` chain
 *   - PP adjuncts with role tags (`location`, `instrument`,
 *     `recipient`, `source`, `goal`)
 *   - copular complement on `predicate.complement`
 *   - imperatives + WH-subjects via synthesised participants
 *   - negation + interrogative flags
 *
 * Embedding (sentential complementation like "I think that X")
 * is currently NOT modelled by the parser; the `embeddedIn` field
 * on `RoleClause` is a structural placeholder for Phase 6+ work.
 */

function parse(s: string): RoleClause {
  const toks = tokeniseEnglish(s);
  const rc = parseSyntaxToClause(toks);
  if (!rc) throw new Error(`parser returned null for: ${s}`);
  return rc;
}

function parseAll(s: string): RoleClause[] {
  return parseSyntaxAllAsClauses(tokeniseEnglish(s));
}

function findP(rc: RoleClause, lemma: string): Participant | undefined {
  return rc.participants.find((p) => p.lemma === lemma);
}

describe("Phase 73c Phase 3 — parseSyntaxToClause core shapes", () => {
  it("transitive 'see' (psych): subject=experiencer, object=stimulus", () => {
    // Phase 5: argFrame for 'see' is ["experiencer", "stimulus"]
    // because the subject isn't a volitional agent.
    const rc = parse("the king sees the wolf");
    expect(rc.kind).toBe("RoleClause");
    expect(rc.predicate.lemma).toBe("see");
    expect(rc.predicate.features?.tense).toBe("present");
    const king = findP(rc, "king")!;
    const wolf = findP(rc, "wolf")!;
    expect(king.role).toBe("experiencer");
    expect(wolf.role).toBe("stimulus");
  });

  it("transitive 'kill' (default agent+patient frame)", () => {
    // No argFrame override → default frame from argFrames.ts.
    const rc = parse("the king kills the wolf");
    expect(findP(rc, "king")!.role).toBe("agent");
    expect(findP(rc, "wolf")!.role).toBe("patient");
  });

  it("intransitive 'run' (unaccusative): subject=theme", () => {
    // Phase 5: argFrame for 'run' is ["theme"] (movement verb).
    const rc = parse("the dog runs");
    const dog = findP(rc, "dog")!;
    expect(dog.role).toBe("theme");
    expect(rc.participants.filter((p) => !p.adjunct)).toHaveLength(1);
  });

  it("ditransitive double-object 'give RECIPIENT THEME': both kept (theme not dropped)", () => {
    // Pre-fix the parser kept only the first post-verbal NP (the recipient,
    // mislabelled theme) and silently dropped the actual theme. English
    // double-object: "give [the man] [the stone]" → recipient=man, theme=stone.
    // The recipient becomes a dative adjunct so it surfaces per the target's
    // adposition typology.
    const rc = parse("the woman gives the man the stone");
    expect(findP(rc, "woman")!.role).toBe("agent");
    const man = findP(rc, "man");
    const stone = findP(rc, "stone");
    expect(stone, "theme 'stone' must not be dropped").toBeDefined();
    expect(man, "recipient 'man' must be kept").toBeDefined();
    expect(stone!.role).toBe("theme");
    expect(man!.role).toBe("recipient");
    expect(man!.adjunct, "recipient surfaces as a dative adjunct").toBe(true);
  });

  it("comparative 'X is bigger than Y' keeps the adjective complement (not 'X is Y')", () => {
    // "than" introduces a comparison standard, not an object; pre-fix the parser
    // grabbed Y as a patient, which suppressed the copular complement sweep so
    // the comparative adjective was dropped, yielding nonsense ("king is dog").
    const rc = parse("the king is bigger than the dog");
    expect(rc.predicate.lemma).toBe("be");
    expect(rc.predicate.complement?.[0]?.lemma).toBe("big");
    expect(rc.predicate.complement?.[0]?.degree).toBe("comparative");
    expect(rc.participants.find((p) => p.lemma === "dog" && !p.adjunct), "'dog' must not be a spurious object").toBeUndefined();
    // The standard "than the dog" is captured as a comparison oblique.
    const dogStd = rc.participants.find((p) => p.lemma === "dog" && p.adjunct);
    expect(dogStd, "comparison standard 'dog' captured as an oblique").toBeDefined();
    expect(dogStd!.preposition).toBe("than");
  });

  it("do-support negation 'do not VERB' keeps the real verb + object", () => {
    // "do" is both a main verb and the do-support auxiliary; pre-fix bare "do"
    // (unlike "does"/"did", already AUX) was tagged a main verb, so "the dogs do
    // not see the birds" picked "do" as the predicate and dropped "see"/"birds".
    const rc = parse("the dogs do not see the birds");
    expect(rc.predicate.lemma).toBe("see");
    expect(rc.negated).toBe(true);
    expect(findP(rc, "dog"), "subject 'dog' kept").toBeDefined();
    expect(findP(rc, "bird"), "object 'bird' not dropped").toBeDefined();
  });

  it("'do' stays a main verb when it isn't do-support ('I do my work')", () => {
    const rc = parse("i do my work");
    expect(rc.predicate.lemma).toBe("do");
  });

  it("synonym adjectives ('large'/'tiny') tag as ADJ, not as the noun head", () => {
    // Pre-fix the tokenizer didn't recognise large/tiny as adjectives → they
    // were tagged N, so the SECOND noun became the head and the real head
    // ("bird") was dropped. Normalizing large→big / tiny→small BEFORE
    // POS-tagging fixes the NP parse.
    const rc = parse("the large dog sees the tiny bird");
    const dog = findP(rc, "dog");
    const bird = findP(rc, "bird");
    expect(dog, "subject head 'dog' kept").toBeDefined();
    expect(bird, "object head 'bird' not dropped").toBeDefined();
    expect(dog!.modifiers?.some((m) => m.kind === "adjective"), "'large' is an adjective on dog").toBe(true);
    expect(bird!.modifiers?.some((m) => m.kind === "adjective"), "'tiny' is an adjective on bird").toBe(true);
  });

  it("prepositional dative 'give THEME to RECIPIENT' still parses (no double-object misfire)", () => {
    // Only ONE bare post-verbal NP (the theme); the recipient is a "to"-PP.
    // collectParticipant breaks at PREP, so the double-object path must not fire.
    const rc = parse("the woman gives the stone to the man");
    expect(findP(rc, "stone")!.role).toBe("theme");
    const man = findP(rc, "man");
    expect(man, "recipient still present via the to-PP").toBeDefined();
    expect(man!.adjunct).toBe(true);
  });

  it("past tense: predicate.features.tense=past", () => {
    const rc = parse("the king saw the wolf");
    expect(rc.predicate.features?.tense).toBe("past");
  });

  it("negation: clause.negated=true", () => {
    const rc = parse("the king does not see the wolf");
    expect(rc.negated).toBe(true);
  });

  it("yes-no interrogative (initial AUX): clause.interrogative=true", () => {
    const rc = parse("does the king see the wolf");
    expect(rc.interrogative).toBe(true);
  });

  it("do-support negation imperative ('do not see') is NOT interrogative", () => {
    // Initial AUX signals a polar question via subject-aux inversion, but
    // "do/does/did + not" is do-support NEGATION ("do not see the wolf" = a
    // negative imperative). Pre-fix it was mis-flagged interrogative, which
    // appended a spurious intonation "?" in intonation-question languages.
    const rc = parse("do not see the wolf");
    expect(rc.interrogative ?? false, "negative imperative is not a question").toBe(false);
    expect(rc.negated, "negation is still captured").toBe(true);
  });

  it("imperative: subject participant is synthesised pronoun 'you'", () => {
    const rc = parse("see the wolf");
    const subj = rc.participants[0]!;
    expect(subj.lemma).toBe("you");
    expect(subj.features?.synthesized).toBe(true);
    expect(rc.predicate.features?.mood).toBe("imperative");
  });

  it("copular: predicate.complement carries adjectives, no patient", () => {
    const rc = parse("the king is tall");
    expect(rc.predicate.lemma).toBe("be");
    expect(rc.predicate.complement).toBeDefined();
    expect(rc.predicate.complement![0]!.lemma).toBe("tall");
    expect(rc.participants.find((p) => p.role === "patient" && !p.adjunct)).toBeUndefined();
  });

  it("PP adjunct: location role + preposition preserved", () => {
    const rc = parse("the king walks at the river");
    const river = findP(rc, "river")!;
    expect(river.adjunct).toBe(true);
    expect(river.role).toBe("location");
    expect(river.preposition).toBe("at");
  });

  it("PP adjunct: instrument role from 'with'", () => {
    const rc = parse("the king cuts the bread with a knife");
    const knife = findP(rc, "knife")!;
    expect(knife.adjunct).toBe(true);
    expect(knife.role).toBe("instrument");
    expect(knife.preposition).toBe("with");
  });

  it("PP adjunct: source role from 'from'", () => {
    const rc = parse("the king walks from the forest");
    const forest = findP(rc, "forest")!;
    expect(forest.role).toBe("source");
  });

  it("PP adjunct: goal role from 'to'", () => {
    const rc = parse("the king walks to the river");
    const river = findP(rc, "river")!;
    expect(river.role).toBe("goal");
  });

  it("determiner becomes a modifier on the participant", () => {
    const rc = parse("the king sees the wolf");
    const king = findP(rc, "king")!;
    expect(king.modifiers?.some((m) => m.kind === "determiner" && m.lemma === "the")).toBe(true);
  });

  it("adjective becomes a modifier on the participant", () => {
    const rc = parse("the big king sees the wolf");
    const king = findP(rc, "king")!;
    expect(king.modifiers?.some((m) => m.kind === "adjective" && m.lemma === "big")).toBe(true);
  });

  it("possessor: 'X of Y' pattern stored as possessor modifier", () => {
    const rc = parse("the king of the realm sees the wolf");
    const king = findP(rc, "king")!;
    const possMod = king.modifiers?.find((m) => m.kind === "possessor");
    expect(possMod).toBeDefined();
    if (possMod && possMod.kind === "possessor") {
      expect(possMod.participant.lemma).toBe("realm");
    }
  });

  it("NP coordination: 'X and Y see Z'", () => {
    const rc = parse("the king and the queen see the wolf");
    // The subject participant is "king"; "queen" hangs off
    // king.modifiers as a coordination modifier.
    const king = findP(rc, "king")!;
    expect(king.modifiers?.some((m) => m.kind === "coordination")).toBe(true);
  });
});

describe("Phase 73c Phase 3 — parseSyntaxAllAsClauses (multi-clause)", () => {
  it("S-coordination chains via coordinatedWith", () => {
    const chain = parseAll("the king sees the wolf , the queen sees the bear");
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[0]!.predicate.lemma).toBe("see");
    expect(chain[1]!.predicate.lemma).toBe("see");
    const king = findP(chain[0]!, "king");
    const queen = findP(chain[1]!, "queen");
    expect(king).toBeDefined();
    expect(queen).toBeDefined();
  });

  it("S-coordination: a gapped 2nd-clause subject inherits the 1st subject even when the clause has an object", () => {
    // "the king walks and sees the wolf" → clause[1] has a gapped subject
    // (no overt nominal before its verb) + an object 'wolf'. Pre-fix the
    // object nominal wrongly blocked subject inheritance, so clause[1]
    // defaulted to a synthesised "you" ("...and YOU see the wolf"). The
    // gapped subject must inherit 'king'.
    const chain = parseAll("the king walks and sees the wolf");
    expect(chain.length).toBe(2);
    const subj1 = chain[1]!.participants[0]!;
    expect(subj1.lemma, `2nd clause subject inherits 'king' (got '${subj1.lemma}')`).toBe("king");
    expect(subj1.features?.synthesized ?? false, "inherited subject is not the synthesised 'you'").toBe(false);
  });

  it("'very' raises the following adjective to degree=intensive", () => {
    // "very big" → the adjective modifier on the head carries degree
    // "intensive" (pre-fix "very" mis-tagged as a noun and was dropped).
    const all = parseAll("the very big dog runs");
    const dog = findP(all[0]!, "dog")!;
    const adjMod = dog.modifiers?.find((m) => m.kind === "adjective" && m.lemma === "big");
    expect(adjMod, "'big' adjective modifier present").toBeDefined();
    if (adjMod && adjMod.kind === "adjective") {
      expect(adjMod.degree, "degree is intensive").toBe("intensive");
    }
  });

  it("subject relative clause + COPULAR matrix ('the dog that runs is big')", () => {
    // The matrix predicate is a copula ("is big") — the AUX "is" is tagged AUX,
    // not V, so the relative-clause extractor found no matrix verb and the whole
    // sentence mis-parsed to verb=run / subject="that". Treating a copular AUX as
    // a predicate head splits it correctly: matrix = copular "be" + complement
    // "big", subject "dog" carrying the relative-clause modifier.
    const all = parseAll("the dog that runs is big");
    expect(all.length).toBe(1);
    const matrix = all[0]!;
    expect(matrix.predicate.lemma, "matrix verb is the copula").toBe("be");
    expect(matrix.predicate.complement?.[0]?.lemma, "complement adjective 'big'").toBe("big");
    const dog = findP(matrix, "dog");
    expect(dog, "subject 'dog' present").toBeDefined();
    expect(dog!.modifiers?.some((m) => m.kind === "relative"), "'dog' carries a relative modifier").toBe(true);
    expect(findP(matrix, "that"), "relativiser 'that' is NOT a participant").toBeUndefined();
  });

  it("relative clause (who) attaches as a modifier on the antecedent", () => {
    const all = parseAll("the king who sees the wolf walks");
    const matrix = all[0]!;
    const king = findP(matrix, "king")!;
    const relMod = king.modifiers?.find((m) => m.kind === "relative");
    expect(relMod).toBeDefined();
    if (relMod && relMod.kind === "relative") {
      expect(relMod.relativiser).toBe("who");
      expect(relMod.clause.predicate.lemma).toBe("see");
    }
  });

  it("relative clause (that) attaches as a modifier on the antecedent", () => {
    const all = parseAll("the wolf that the king sees runs");
    const matrix = all[0]!;
    const wolf = findP(matrix, "wolf")!;
    const relMod = wolf.modifiers?.find((m) => m.kind === "relative");
    expect(relMod).toBeDefined();
  });

  it("single sentence with no RC or coord returns a single-element array", () => {
    const all = parseAll("the king sees the wolf");
    expect(all).toHaveLength(1);
    expect(all[0]!.coordinatedWith).toBeUndefined();
  });
});

describe("Phase 73c Phase 3 — feature inference", () => {
  it("reportative verb sets evidential=reportative", () => {
    const rc = parse("the king says the truth");
    expect(rc.predicate.features?.evidential).toBe("reportative");
  });

  it("inferred verb sets evidential=inferred", () => {
    const rc = parse("the king thinks the truth");
    expect(rc.predicate.features?.evidential).toBe("inferred");
  });

  it("direct-perception verb sets evidential=direct", () => {
    const rc = parse("the king sees the wolf");
    expect(rc.predicate.features?.evidential).toBe("direct");
  });

  it("honorific cue ('sir') sets honorific=true", () => {
    const rc = parse("the sir sees the wolf");
    expect(rc.predicate.features?.honorific).toBe(true);
  });

  it("progressive aspect from 'is …-ing'", () => {
    const rc = parse("the king is running");
    expect(rc.predicate.features?.aspect).toBe("progressive");
  });
});
