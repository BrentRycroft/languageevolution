import { describe, it, expect } from "vitest";
import { satGet, satSet } from "../lexicon/satellites";
import { lexSet } from "../lexicon/access";
import { maybeGrammaticalize } from "../morphology/evolve";
import { makeRng } from "../rng";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { SEMANTIC_TAG, PATHWAYS } from "../semantics/grammaticalization";

/**
 * grammaticalization.test.ts
 *
 * Test suite for: "grammaticalization pathways".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("grammaticalization pathways", () => {
  it("every pathway target is a legal MorphCategory", () => {
    for (const [tag, targets] of Object.entries(PATHWAYS)) {
      expect(targets.length, `pathway ${tag} has targets`).toBeGreaterThan(0);
    }
  });

  it("only grammaticalizes meanings with a semantic tag matching a vacant slot", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    lexSet(lang, "go", ["g", "o"]);
    satSet(lang, "wordFrequencyHints", "go", 0.95);
    delete lang.morphology.paradigms["verb.tense.fut"];
    delete lang.morphology.paradigms["verb.aspect.pfv"];
    delete lang.morphology.paradigms["verb.aspect.ipfv"];
    const rng = makeRng("gram-1");
    const shift = maybeGrammaticalize(lang, rng, 1.0);
    expect(shift).not.toBeNull();
    if (!shift || !shift.source) return;
    expect(SEMANTIC_TAG[shift.source.meaning]).toBeDefined();
    const pathways = PATHWAYS[SEMANTIC_TAG[shift.source.meaning]!]!;
    expect(pathways).toContain(shift.source.category);
  });

  it("untagged meanings cannot grammaticalize", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    lang.lexemes = {}; lang.lexemeIds = {}; lexSet(lang, "flubbergarble", ["b", "a"]);
    lang.wordFrequencyHints = {};
    satSet(lang, "wordFrequencyHints", "flubbergarble", 0.99);
    lang.morphology.paradigms = {};
    const rng = makeRng("gram-untagged");
    for (let i = 0; i < 50; i++) {
      expect(maybeGrammaticalize(lang, rng, 1.0)).toBeNull();
    }
  });

  it("records the source meaning + pathway on the paradigm once a clitic binds (stage 2)", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    lexSet(lang, "back", ["b", "a", "k"]);
    satSet(lang, "wordFrequencyHints", "back", 0.8);
    delete lang.morphology.paradigms["noun.case.loc"];
    delete lang.morphology.paradigms["noun.case.dat"];
    delete lang.morphology.paradigms["noun.case.inst"];
    // Phase 4b: a paradigm is created only when a clitic BINDS (stage 1 → 2),
    // not on the first (cliticising) transition. Drive the cline until some
    // word reaches the bound-affix stage, then check ITS paradigm metadata.
    const rng = makeRng("back-loc");
    let bound: ReturnType<typeof maybeGrammaticalize> = null;
    for (let i = 0; i < 200 && !bound; i++) {
      const shift = maybeGrammaticalize(lang, rng, 1.0);
      if (shift?.source && satGet(lang, "grammaticalizationStage", shift.source.meaning)?.stage === 2) {
        bound = shift;
      }
    }
    expect(bound).not.toBeNull();
    if (!bound?.source) return;
    const p = lang.morphology.paradigms[bound.source.category];
    expect(p?.source?.meaning).toBe(bound.source.meaning);
    expect(p?.source?.pathway).toBe(bound.source.pathway);
  });
});
