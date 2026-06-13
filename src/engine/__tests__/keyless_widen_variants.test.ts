import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { coinKeylessLexeme } from "../lexicon/lexemeIdentity";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { satGet } from "../lexicon/satellites";
import { stepPhonology } from "../steps/phonology";
import { makeRng } from "../rng";

/**
 * keyless_widen_variants.test.ts — S2b task 2.
 * A keyless (gloss-less, point-native) word changes form via the regular-sweep path, which the seeded
 * before/after recording loop never observes. S2b snapshots keyless forms and records their
 * variants/innovations under the keyless LexemeId so they feed the variant / social-contagion machinery.
 */
describe("S2b task 2 — variants for keyless words", () => {
  it("a keyless word that changes under sound change records variants under its id", () => {
    const config = presetEnglish();
    const sim = createSimulation(config);
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    const kid = coinKeylessLexeme(lang, fromFloats(embed("fire")),
      ["k", "a", "t", "a", "p", "u", "l", "t", "a", "s"]);
    // seed proven to evolve this exact keyless form over 30 gens (cf. keyless_gap_coinage S1 lock test)
    const rng = makeRng("keyless-evolve-lock");
    const before = lang.lexemes[kid]!.form.join("");
    for (let g = 1; g <= 30; g++) stepPhonology(lang, config, rng, g);
    expect(lang.lexemes[kid]!.form.join("")).not.toBe(before); // precondition: it actually changed
    const variants = satGet(lang, "variants", kid);
    expect(variants && variants.length).toBeGreaterThan(0);
  });
});
