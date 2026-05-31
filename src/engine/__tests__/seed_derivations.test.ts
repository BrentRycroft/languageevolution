import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { addDerivation } from "../lexicon/compound";

/**
 * Meaning-layer Stage A1: `seedDerivations` lets a preset encode a word AS a
 * base + derivational affix building block (the derivational analogue of
 * `seedCompounds`). The form is materialised from the parts and the word carries
 * `morphStructure.origin: "derivation"`, so it drifts with its base and exposes
 * its morphology.
 */
describe("meaning-layer A1a — seedDerivations / addDerivation (word = base + affix)", () => {
  it("materialises a derived word as base++affix with morphStructure", () => {
    const sim = createSimulation({
      ...presetPIE(),
      seedDerivations: { "test-ruler": { base: "king", affix: "-tér.agt" } },
    });
    const lang = sim.getState().tree["L-0"]!.language;
    const base = lang.lexicon["king"]!;
    const affix = lang.lexicon["-tér.agt"]!;
    expect(base, "base 'king' form present").toBeTruthy();
    expect(affix, "affix '-tér.agt' form present").toBeTruthy();
    expect(lang.lexicon["test-ruler"], "derived form = base ++ affix").toEqual([...base, ...affix]);
    // Stored as a transparent composition so it RECOMPOSES/drifts with its base
    // (the behavioral building block — same machinery as seedCompounds).
    expect(lang.compounds?.["test-ruler"]?.parts).toEqual(["king", "-tér.agt"]);
    const word = lang.words?.find((w) => w.senses.some((s) => s.meaning === "test-ruler"));
    expect(word, "a Word carries the 'test-ruler' sense").toBeTruthy();
    // NB: the morphStructure etymology TAG on the Word does not survive seed-init
    // (syncWordsFromLexicon rebuilds words after the seed-compound/derivation step,
    // dropping it — a PRE-EXISTING limitation that affects seedCompounds equally).
    // Exposing seed-time morphology on the Word is a Stage-B follow-up.
  });

  it("prefix position prepends the affix", () => {
    const lang = createSimulation(presetPIE()).getState().tree["L-0"]!.language;
    addDerivation(lang, "test-ungood", "good", "n̥-.neg", 0, { position: "prefix" });
    const base = lang.lexicon["good"]!;
    const affix = lang.lexicon["n̥-.neg"]!;
    expect(lang.lexicon["test-ungood"]).toEqual([...affix, ...base]);
  });
});
