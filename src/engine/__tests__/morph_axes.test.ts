import { describe, it, expect } from "vitest";
import {
  toCategoryAxis,
  fromCategoryAxis,
  type CategoryAxis,
  type CategoryAxisKind,
  type MorphCategory,
} from "../morphology/types";

/**
 * Phase 73c Tier C Phase 1 — `CategoryAxis` round-trip identity.
 *
 * For every category that decomposes onto one of the six gated
 * axes (tense, aspect, mood, voice, evidentiality, case), the
 * mapper + reverse mapper round-trip cleanly. Categories on
 * non-gated axes (number, nounClass, person, etc.) return null
 * from `toCategoryAxis` and aren't tested here.
 */

const ROUND_TRIP_CATEGORIES: MorphCategory[] = [
  "verb.tense.past",
  "verb.tense.fut",
  "verb.aspect.pfv",
  "verb.aspect.ipfv",
  "verb.aspect.prog",
  "verb.aspect.hab",
  "verb.aspect.perf",
  "verb.aspect.prosp",
  "verb.mood.subj",
  "verb.mood.imp",
  "verb.mood.cond",
  "verb.mood.opt",
  "verb.mood.jus",
  "verb.mood.irr",
  "verb.mood.dub",
  "verb.mood.hort",
  "verb.voice.pass",
  "verb.evid.dir",
  "verb.evid.rep",
  "verb.evid.inf",
  "noun.case.nom",
  "noun.case.acc",
  "noun.case.gen",
  "noun.case.dat",
  "noun.case.loc",
  "noun.case.inst",
  "noun.case.abl",
  "noun.case.erg",
  "noun.case.abs",
];

const NON_GATED_CATEGORIES: MorphCategory[] = [
  "noun.num.pl",
  "noun.class.3",
  "verb.person.1sg",
  "verb.subord.ss",
  "verb.honor.formal",
  "adj.degree.cmp",
  "discourse.q",
];

describe("Phase 73c Phase 1 — CategoryAxis round-trip", () => {
  it("every gated MorphCategory round-trips identically", () => {
    for (const cat of ROUND_TRIP_CATEGORIES) {
      const decomposed = toCategoryAxis(cat);
      expect(decomposed, `${cat} should decompose`).not.toBeNull();
      const back = fromCategoryAxis(decomposed!);
      expect(back, `${cat} should round-trip`).toBe(cat);
    }
  });

  it("non-gated MorphCategories return null from toCategoryAxis", () => {
    for (const cat of NON_GATED_CATEGORIES) {
      expect(toCategoryAxis(cat), `${cat} should not decompose`).toBeNull();
    }
  });

  it("fromCategoryAxis returns null for axis values outside the legal range", () => {
    const illegal: CategoryAxis[] = [
      { axis: "tense", value: "frobnicate" },
      { axis: "aspect", value: "neoplatonic" },
      { axis: "case", value: "vocative" }, // valid linguistically; not in MorphCategory
      { axis: "voice", value: "antipassive" },
    ];
    for (const ax of illegal) {
      expect(fromCategoryAxis(ax)).toBeNull();
    }
  });

  it("decomposed axis kind is one of the six gated axes", () => {
    const gated: CategoryAxisKind[] = ["tense", "aspect", "mood", "voice", "evidentiality", "case"];
    for (const cat of ROUND_TRIP_CATEGORIES) {
      const ax = toCategoryAxis(cat)!;
      expect(gated).toContain(ax.axis);
    }
  });
});
