import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import {
  composeTargetClause,
  type AbstractTemplate,
  type SlotAssignment,
} from "../narrative/composer";
import { makeDiscourse } from "../narrative/discourse";
import type { DiscourseContext } from "../narrative/discourse";
import type { Language } from "../types";

/**
 * Phase 73c Tier C Phase 2 — composer emits Role-IR.
 *
 * Asserts the `RoleClause` shape `composeTargetClause` builds for
 * each of the seven canonical templates the discourse pipeline
 * uses. The IR contract:
 *   - subject participant carries role `agent` (Phase 5 will
 *     refine via predicate `argFrame` so e.g. `see`'s subject
 *     becomes `experiencer`).
 *   - object participant carries role `patient`.
 *   - place adjuncts carry shape-derived roles (`location`,
 *     `source`, `goal`, `instrument`, `recipient`).
 *   - tense, aspect, negation surface on `predicate.features`
 *     and `clause.negated`.
 *
 * The narrative_snapshot byte-identity test (separate file)
 * verifies that Phase 2's refactor of the composer body has not
 * changed token output. This test verifies the IR view is
 * correctly constructed.
 */

function freshLang(seed: string): { lang: Language; ctx: DiscourseContext } {
  const sim = createSimulation({ ...defaultConfig(), seed });
  const lang = sim.getState().tree[sim.getState().rootId]!.language;
  const ctx = makeDiscourse("daily");
  return { lang, ctx };
}

function transitive(): AbstractTemplate {
  return {
    shape: "transitive",
    tense: "past",
    needs: { subject: true, object: true, adjective: false, time: false, place: false },
    introducesEntity: true,
  };
}

const ALL_SLOTS: SlotAssignment = {
  verb: "see",
  subject: "king",
  object: "wolf",
  adjective: "big",
  place: "river",
  time: "morning",
};

describe("Phase 73c Phase 2 — composeTargetClause IR shape", () => {
  it("transitive 'see' (psych): subject=experiencer, object=stimulus", () => {
    // Phase 5: `see` has argFrame ["experiencer", "stimulus"] so
    // its subject is NOT an agent (king doesn't volitionally see).
    const { lang, ctx } = freshLang("p2-trans");
    const clause = composeTargetClause(lang, transitive(), { verb: "see", subject: "king", object: "wolf" }, ctx);
    expect(clause.kind).toBe("RoleClause");
    expect(clause.predicate.lemma).toBe("see");
    expect(clause.predicate.features?.tense).toBe("past");
    expect(clause.participants).toHaveLength(2);
    const subj = clause.participants.find((p) => p.lemma === "king")!;
    const obj = clause.participants.find((p) => p.lemma === "wolf")!;
    expect(subj.role).toBe("experiencer");
    expect(obj.role).toBe("stimulus");
    expect(subj.adjunct).toBeUndefined();
    expect(obj.adjunct).toBeUndefined();
  });

  it("transitive 'kill' (default agent+patient frame): no argFrame override", () => {
    const { lang, ctx } = freshLang("p2-trans-default");
    const tpl: AbstractTemplate = {
      shape: "transitive",
      tense: "past",
      needs: { subject: true, object: true, adjective: false, time: false, place: false },
    };
    const clause = composeTargetClause(lang, tpl, { verb: "kill", subject: "king", object: "wolf" }, ctx);
    const subj = clause.participants.find((p) => p.lemma === "king")!;
    const obj = clause.participants.find((p) => p.lemma === "wolf")!;
    expect(subj.role).toBe("agent");
    expect(obj.role).toBe("patient");
  });

  it("intransitive 'run' (unaccusative): subject=theme", () => {
    // Phase 5: `run` has argFrame ["theme"] (movement verb where
    // the subject is the thing moving, not volitional agent).
    const { lang, ctx } = freshLang("p2-intrans");
    const tpl: AbstractTemplate = {
      shape: "intransitive",
      tense: "present",
      needs: { subject: true, object: false, adjective: false, time: false, place: false },
    };
    const clause = composeTargetClause(lang, tpl, { verb: "run", subject: "dog" }, ctx);
    expect(clause.participants).toHaveLength(1);
    expect(clause.participants[0]!.role).toBe("theme");
    expect(clause.predicate.features?.tense).toBe("present");
  });

  it("transitive_adj: adjective attaches to object as modifier", () => {
    const { lang, ctx } = freshLang("p2-trans-adj");
    const tpl: AbstractTemplate = {
      shape: "transitive_adj",
      tense: "past",
      needs: { subject: true, object: true, adjective: true, time: false, place: false },
    };
    const clause = composeTargetClause(lang, tpl, { verb: "see", subject: "king", object: "wolf", adjective: "big" }, ctx);
    const obj = clause.participants.find((p) => p.lemma === "wolf")!;
    expect(obj.modifiers).toBeDefined();
    expect(obj.modifiers!.some((m) => m.kind === "adjective" && m.lemma === "big")).toBe(true);
    const subj = clause.participants.find((p) => p.lemma === "king")!;
    expect(subj.modifiers).toBeUndefined();
  });

  it("adj_subject: adjective attaches to subject as modifier", () => {
    const { lang, ctx } = freshLang("p2-adj-subj");
    const tpl: AbstractTemplate = {
      shape: "adj_subject",
      tense: "present",
      needs: { subject: true, object: false, adjective: true, time: false, place: false },
    };
    const clause = composeTargetClause(lang, tpl, { verb: "be", subject: "king", adjective: "tall" }, ctx);
    const subj = clause.participants.find((p) => p.lemma === "king")!;
    expect(subj.modifiers!.some((m) => m.kind === "adjective" && m.lemma === "tall")).toBe(true);
  });

  it("place_intrans: place becomes location adjunct", () => {
    const { lang, ctx } = freshLang("p2-place-intrans");
    const tpl: AbstractTemplate = {
      shape: "place_intrans",
      tense: "past",
      needs: { subject: true, object: false, adjective: false, time: false, place: true },
    };
    const clause = composeTargetClause(lang, tpl, { verb: "walk", subject: "king", place: "river" }, ctx);
    const adj = clause.participants.find((p) => p.lemma === "river")!;
    expect(adj.role).toBe("location");
    expect(adj.adjunct).toBe(true);
  });

  it("motion_source/goal: place gets shape-derived adjunct role", () => {
    const { lang, ctx } = freshLang("p2-motion");
    const sourceTpl: AbstractTemplate = {
      shape: "motion_source",
      tense: "past",
      needs: { subject: true, object: false, adjective: false, time: false, place: true },
    };
    const goalTpl: AbstractTemplate = {
      shape: "motion_goal",
      tense: "past",
      needs: { subject: true, object: false, adjective: false, time: false, place: true },
    };
    const sourceClause = composeTargetClause(lang, sourceTpl, { verb: "walk", subject: "king", place: "river" }, ctx);
    const goalClause = composeTargetClause(lang, goalTpl, { verb: "walk", subject: "king", place: "river" }, ctx);
    expect(sourceClause.participants.find((p) => p.lemma === "river")!.role).toBe("source");
    expect(goalClause.participants.find((p) => p.lemma === "river")!.role).toBe("goal");
  });

  it("instrument_adjunct / benefactive: shape-derived adjunct roles", () => {
    const { lang, ctx } = freshLang("p2-instr");
    const instrTpl: AbstractTemplate = {
      shape: "instrument_adjunct",
      tense: "past",
      needs: { subject: true, object: true, adjective: false, time: false, place: true },
    };
    const beneTpl: AbstractTemplate = {
      shape: "benefactive",
      tense: "past",
      needs: { subject: true, object: true, adjective: false, time: false, place: true },
    };
    const instrClause = composeTargetClause(lang, instrTpl, { verb: "open", subject: "king", object: "door", place: "stone" }, ctx);
    const beneClause = composeTargetClause(lang, beneTpl, { verb: "make", subject: "king", object: "bread", place: "wolf" }, ctx);
    expect(instrClause.participants.find((p) => p.lemma === "stone")!.role).toBe("instrument");
    expect(beneClause.participants.find((p) => p.lemma === "wolf")!.role).toBe("recipient");
  });

  it("time slot becomes time adjunct, irrespective of template shape", () => {
    const { lang, ctx } = freshLang("p2-time");
    const tpl: AbstractTemplate = {
      shape: "time_prefix_intrans",
      tense: "past",
      needs: { subject: true, object: false, adjective: false, time: true, place: false },
    };
    const clause = composeTargetClause(lang, tpl, { verb: "walk", subject: "king", time: "morning" }, ctx);
    const t = clause.participants.find((p) => p.lemma === "morning")!;
    expect(t.role).toBe("time");
    expect(t.adjunct).toBe(true);
  });

  it("perfect aspect surfaces on predicate.features.aspect", () => {
    const { lang, ctx } = freshLang("p2-perf");
    const tpl: AbstractTemplate = {
      ...transitive(),
      aspect: "perfect",
    };
    const clause = composeTargetClause(lang, tpl, { verb: "see", subject: "king", object: "wolf" }, ctx);
    expect(clause.predicate.features?.aspect).toBe("perfect");
  });

  it("negated template surfaces on clause.negated", () => {
    const { lang, ctx } = freshLang("p2-neg");
    const tpl: AbstractTemplate = { ...transitive(), negated: true };
    const clause = composeTargetClause(lang, tpl, { verb: "see", subject: "king", object: "wolf" }, ctx);
    expect(clause.negated).toBe(true);
  });

  it("all slots populated: clause carries subject + object + time + place", () => {
    const { lang, ctx } = freshLang("p2-all");
    const tpl: AbstractTemplate = {
      shape: "transitive",
      tense: "past",
      needs: { subject: true, object: true, adjective: true, time: true, place: true },
    };
    const clause = composeTargetClause(lang, tpl, ALL_SLOTS, ctx);
    expect(clause.participants.find((p) => p.lemma === "king")).toBeDefined();
    expect(clause.participants.find((p) => p.lemma === "wolf")).toBeDefined();
    expect(clause.participants.find((p) => p.lemma === "morning")).toBeDefined();
    expect(clause.participants.find((p) => p.lemma === "river")).toBeDefined();
  });
});
