import { describe, it, expect } from "vitest";
import { stepPhonotacticRepair } from "../steps/inventoryManagement";
import { phonotacticScore } from "../phonology/phonotactics";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { makeRng } from "../rng";
import type { Language } from "../types";

function freshLang(buildPreset: () => ReturnType<typeof presetEnglish>): Language {
  const sim = createSimulation(buildPreset());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 27c — stepPhonotacticRepair", () => {
  it("repairs a CCC onset in a strict-CV language (Toki Pona)", () => {
    const lang = freshLang(presetTokipona);
    expect(lang.phonotacticProfile?.maxOnset).toBe(1);
    // Inject a violating form: "stra" — CCC onset.
    lang.lexicon["__test_violator__"] = ["s", "t", "r", "a"];
    const before = phonotacticScore(
      lang.lexicon["__test_violator__"]!,
      lang.phonotacticProfile!,
    );
    expect(before).toBeLessThan(0.5);

    const rng = makeRng("repair-test-1");
    stepPhonotacticRepair(lang, rng, 1);

    const repaired = lang.lexicon["__test_violator__"]!;
    const after = phonotacticScore(repaired, lang.phonotacticProfile!);
    // Either the form was lengthened (epenthesis fired) or it was left
    // alone if no rule produced a meaningful improvement. The first
    // expectation is that *some* repair fired given the heavy violation.
    expect(repaired.length).toBeGreaterThan(4);
    expect(after).toBeGreaterThan(before);
  });

  it("leaves compliant forms alone in a permissive language (English)", () => {
    const lang = freshLang(presetEnglish);
    // English seed forms should mostly be compliant.
    const snapshot = JSON.parse(JSON.stringify(lang.lexicon));
    const rng = makeRng("repair-test-2");
    stepPhonotacticRepair(lang, rng, 1);
    // We don't assert that NO repair fired (some seed forms may still
    // be heavy violators), but most English words should be untouched.
    let unchanged = 0;
    let total = 0;
    for (const m of Object.keys(snapshot)) {
      total++;
      if (
        JSON.stringify(snapshot[m]) === JSON.stringify(lang.lexicon[m])
      ) {
        unchanged++;
      }
    }
    expect(unchanged / total).toBeGreaterThan(0.9);
  });

  it("respects the MAX_REPAIRS_PER_GEN cap", () => {
    const lang = freshLang(presetTokipona);
    // Inject 10 violating forms; only ~3 should be repaired in one step.
    for (let i = 0; i < 10; i++) {
      lang.lexicon[`__violator_${i}__`] = ["s", "t", "r", "a", String.fromCharCode(98 + i)];
    }
    const before = Object.keys(lang.lexicon).map((m) => ({
      m,
      form: lang.lexicon[m]!.slice(),
    }));

    const rng = makeRng("repair-test-3");
    stepPhonotacticRepair(lang, rng, 1);

    const changed = before.filter(
      (e) => JSON.stringify(lang.lexicon[e.m]) !== JSON.stringify(e.form),
    ).length;
    expect(changed).toBeLessThanOrEqual(3);
    // And at least one change happened (the function isn't a noop).
    expect(changed).toBeGreaterThan(0);
  });

  it("emits a sound_change event with the phonotactic_repair tag", () => {
    const lang = freshLang(presetTokipona);
    lang.lexicon["__test_violator__"] = ["s", "t", "r", "a"];
    lang.events = [];
    const rng = makeRng("repair-test-4");
    stepPhonotacticRepair(lang, rng, 7);
    const repairEvents = lang.events.filter(
      (e) => e.meta?.category === "phonotactic_repair",
    );
    expect(repairEvents.length).toBeGreaterThanOrEqual(1);
    expect(repairEvents[0]!.kind).toBe("sound_change");
    expect(repairEvents[0]!.generation).toBe(7);
  });

  it("noop when the language has no phonotactic profile", () => {
    const lang = freshLang(presetEnglish);
    delete lang.phonotacticProfile;
    lang.lexicon["__test_violator__"] = ["s", "t", "r", "a"];
    const rng = makeRng("repair-test-5");
    expect(() => stepPhonotacticRepair(lang, rng, 1)).not.toThrow();
    // Form unchanged.
    expect(lang.lexicon["__test_violator__"]).toEqual(["s", "t", "r", "a"]);
  });

  it("noop when the profile has zero strictness", () => {
    const lang = freshLang(presetEnglish);
    lang.phonotacticProfile = { maxOnset: 1, maxCoda: 0, maxCluster: 1, strictness: 0 };
    lang.lexicon["__test_violator__"] = ["s", "t", "r", "a"];
    const rng = makeRng("repair-test-6");
    stepPhonotacticRepair(lang, rng, 1);
    expect(lang.lexicon["__test_violator__"]).toEqual(["s", "t", "r", "a"]);
  });
});

describe("Phase 27c — long-run integration", () => {
  it("Toki Pona run keeps mean phonotactic score high over 60 gens", () => {
    const cfg = { ...presetTokipona(), seed: "phonotactic-repair-tokipona" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 60; i++) sim.step();
    const state = sim.getState();
    const root = state.tree[state.rootId]!.language;
    if (root.extinct) return;
    const profile = root.phonotacticProfile!;
    const scores = Object.values(root.lexicon).map((f) =>
      phonotacticScore(f, profile),
    );
    const mean = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
    // With a strict profile + active repair, mean score should stay high.
    expect(mean).toBeGreaterThan(0.7);
  }, 60_000);
});
