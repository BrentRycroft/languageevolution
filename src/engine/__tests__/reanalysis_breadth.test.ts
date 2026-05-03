import { describe, it, expect } from "vitest";
import { maybeReanalyse } from "../lexicon/reanalysis";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { makeRng } from "../rng";

/**
 * Phase 28e: reanalysis broadening. Pre-28e, `maybeReanalyse` only
 * promoted compound meanings (containing "-") into derivational
 * suffixes. Phase 28e adds a verb-grammaticalisation branch that
 * promotes high-frequency motion / possession / copula verbs into
 * tense / aspect inflections (motion → future, have → perfect,
 * be → progressive). Models the canonical analytic-→-synthetic
 * cycle (English "going to" → "gonna" → future marker).
 */

describe("Phase 28e — verb grammaticalization", () => {
  it("promotes a high-frequency motion verb into a tense paradigm in tier 1+", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.culturalTier = 2;
    lang.wordFrequencyHints["go"] = 0.95;
    lang.lexicon["go"] = ["g", "o"];
    if (!lang.morphology) throw new Error("expected morphology block");
    delete lang.morphology.paradigms["verb.tense.fut"];
    delete lang.morphology.paradigms["verb.aspect.perf"];
    delete lang.morphology.paradigms["verb.aspect.prog"];
    let event: ReturnType<typeof maybeReanalyse> = null;
    // The grammaticalisation branch fires with internal probability ×
    // outer probability; try many seeds to ensure deterministic hit.
    for (let i = 0; i < 50 && !event; i++) {
      const rng = makeRng(`reanal-${i}`);
      event = maybeReanalyse(lang, rng, 1.0);
    }
    expect(event, "expected at least one reanalysis event in 50 tries").not.toBeNull();
    if (!event) return;
    const validTags = [
      "verb.tense.fut",
      "verb.aspect.perf",
      "verb.aspect.prog",
    ];
    const grammaticalisedTag = validTags.find((t) => event!.promotedTag === t);
    expect(grammaticalisedTag, `tag ${event.promotedTag}`).toBeDefined();
    expect(
      lang.morphology.paradigms[grammaticalisedTag as never],
    ).toBeDefined();
  });

  it("does NOT fire on tier 0 languages", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.culturalTier = 0;
    lang.wordFrequencyHints["go"] = 0.95;
    lang.lexicon["go"] = ["g", "o"];
    if (!lang.morphology) throw new Error("expected morphology block");
    delete lang.morphology.paradigms["verb.tense.fut"];
    delete lang.morphology.paradigms["verb.aspect.perf"];
    delete lang.morphology.paradigms["verb.aspect.prog"];
    // Run many tries; the only possible event is compound-reanalysis
    // (no compounds present → null), so we expect the new fut/perf/prog
    // paradigms to remain undefined.
    for (let i = 0; i < 50; i++) {
      const rng = makeRng(`reanal-tier0-${i}`);
      maybeReanalyse(lang, rng, 1.0);
    }
    expect(lang.morphology.paradigms["verb.tense.fut"]).toBeUndefined();
    expect(lang.morphology.paradigms["verb.aspect.perf"]).toBeUndefined();
    expect(lang.morphology.paradigms["verb.aspect.prog"]).toBeUndefined();
  });
});
