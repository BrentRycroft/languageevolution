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
