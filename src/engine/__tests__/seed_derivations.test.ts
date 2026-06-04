import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetPIE } from "../presets/pie";
import { addDerivation } from "../lexicon/compound";
import { lexGet } from "../lexicon/access";

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
    const base = lexGet(lang, "king")!;
    const affix = lexGet(lang, "-tér.agt")!;
    expect(base, "base 'king' form present").toBeTruthy();
    expect(affix, "affix '-tér.agt' form present").toBeTruthy();
    expect(lexGet(lang, "test-ruler"), "derived form = base ++ affix").toEqual([...base, ...affix]);
    // Stored as a transparent composition so it RECOMPOSES/drifts with its base
    // (the behavioral building block — same machinery as seedCompounds).
    expect(lang.compounds?.["test-ruler"]?.parts).toEqual(["king", "-tér.agt"]);
    const word = lang.words?.find((w) => w.senses.some((s) => s.meaning === "test-ruler"));
    expect(word, "a Word carries the 'test-ruler' sense").toBeTruthy();
    // Lane D (morphology encoding) closed the ROADMAP §144 gap: the
    // morphStructure etymology now SURVIVES seed-init. syncWordsFromLexicon
    // re-derives it from the recorded parts (lang.compounds), so a seeded
    // derivation knows its base + affix from gen 0. ('-tér.agt' isn't in this
    // PIE proto's boundMorphemes, so it's recorded as a transparent compound
    // of [king, -tér.agt] rather than a base/affix derivation — either way the
    // structure is now on the Word.)
    expect(word!.morphStructure, "seed-time structure persists onto the Word").toBeDefined();
    expect(word!.morphStructure!.parts ?? [word!.morphStructure!.base, word!.morphStructure!.affix])
      .toContain("king");
  });

  it("prefix position prepends the affix", () => {
    const lang = createSimulation(presetPIE()).getState().tree["L-0"]!.language;
    addDerivation(lang, "test-ungood", "good", "n̥-.neg", 0, { position: "prefix" });
    const base = lexGet(lang, "good")!;
    const affix = lexGet(lang, "n̥-.neg")!;
    expect(lexGet(lang, "test-ungood")).toEqual([...affix, ...base]);
  });
});
