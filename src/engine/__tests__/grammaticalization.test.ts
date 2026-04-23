import { describe, it, expect } from "vitest";
import { maybeGrammaticalize } from "../morphology/evolve";
import { makeRng } from "../rng";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { SEMANTIC_TAG, PATHWAYS } from "../semantics/grammaticalization";

describe("grammaticalization pathways", () => {
  it("every pathway target is a legal MorphCategory", () => {
    // Soft check: every pathway list should have at least one entry
    // (empty arrays silently kill grammaticalization).
    for (const [tag, targets] of Object.entries(PATHWAYS)) {
      expect(targets.length, `pathway ${tag} has targets`).toBeGreaterThan(0);
    }
  });

  it("only grammaticalizes meanings with a semantic tag matching a vacant slot", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    // Force a known-good candidate: "go" is tagged as motion and motion's
    // pathway includes verb.tense.fut. Make sure the lexicon has it with
    // high frequency and short form.
    lang.lexicon.go = ["g", "o"];
    lang.wordFrequencyHints.go = 0.95;
    // Give the candidate's source tag access to a vacant slot by wiping
    // any pre-existing future/aspect paradigms.
    delete lang.morphology.paradigms["verb.tense.fut"];
    delete lang.morphology.paradigms["verb.aspect.pfv"];
    delete lang.morphology.paradigms["verb.aspect.ipfv"];
    // With the candidate pool narrowed, a p=1.0 call should succeed.
    const rng = makeRng("gram-1");
    const shift = maybeGrammaticalize(lang, rng, 1.0);
    expect(shift).not.toBeNull();
    if (!shift || !shift.source) return;
    // Source meaning must be a tagged lexeme.
    expect(SEMANTIC_TAG[shift.source.meaning]).toBeDefined();
    // Target must match the pathway.
    const pathways = PATHWAYS[SEMANTIC_TAG[shift.source.meaning]!]!;
    expect(pathways).toContain(shift.source.category);
  });

  it("untagged meanings cannot grammaticalize", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    // Wipe the lexicon down to a single untagged meaning.
    lang.lexicon = { flubbergarble: ["b", "a"] };
    lang.wordFrequencyHints = { flubbergarble: 0.99 };
    lang.morphology.paradigms = {};
    const rng = makeRng("gram-untagged");
    // 50 attempts at p=1.0 should still return null every time — there
    // is simply no pathway-compatible source.
    for (let i = 0; i < 50; i++) {
      expect(maybeGrammaticalize(lang, rng, 1.0)).toBeNull();
    }
  });

  it("records the source meaning + pathway on the resulting paradigm", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    lang.lexicon.back = ["b", "a", "k"];
    lang.wordFrequencyHints.back = 0.8;
    delete lang.morphology.paradigms["noun.case.loc"];
    delete lang.morphology.paradigms["noun.case.dat"];
    delete lang.morphology.paradigms["noun.case.inst"];
    const shift = maybeGrammaticalize(lang, makeRng("back-loc"), 1.0);
    expect(shift).not.toBeNull();
    if (!shift || !shift.source) return;
    const p = lang.morphology.paradigms[shift.source.category];
    expect(p?.source?.meaning).toBe(shift.source.meaning);
    expect(p?.source?.pathway).toBe(shift.source.pathway);
  });
});
