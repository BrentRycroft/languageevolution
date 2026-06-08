import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { coinKeylessLexeme } from "../lexicon/lexemeIdentity";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { satGet, satSet } from "../lexicon/satellites";
import { effectivePosOf, evolvableLexemes } from "../lexicon/evolvable";
import { proposeAblautEmergence } from "../morphology/ablaut";
import { makeRng } from "../rng";
import type { Language } from "../types";

function rootLang(): Language {
  const s = createSimulation(presetEnglish()).getState();
  return s.tree[s.rootId]!.language;
}

/**
 * keyless_widen_ablaut.test.ts — S2b task 4.
 * A keyless word coined near a verb concept reads as a verb (effectivePosOf via emergent gloss) and is
 * a first-class candidate for ablaut emergence — assigned an ablaut class under its own LexemeId.
 * Form-based → no maturity gate. (Made deterministic by leaving the keyless word the SOLE candidate,
 * since ablaut fires rarely and otherwise competes with ~40 seeded verbs.)
 */
describe("S2b task 4 — ablaut for keyless verbs", () => {
  it("a keyless high-freq verb is a first-class ablaut candidate and is assigned a class under its id", () => {
    const lang = rootLang();
    lang.morphology.paradigms["verb.tense.past"] ??= {
      affix: ["e", "d"], position: "suffix", category: "verb.tense.past",
    };
    // POS comes from the POINT (embed("run") → emergent gloss "run" → verb); the FORM is independent,
    // so use a form containing "a" (broadly alternatable) so pickAlternation can fire.
    const kid = coinKeylessLexeme(lang, fromFloats(embed("run")), ["r", "a", "n"]);
    expect(effectivePosOf(lang, kid)).toBe("verb"); // precondition: keyless word is a verb
    satSet(lang, "wordFrequencyHints", kid, 0.9); // ablaut needs freq >= 0.7

    // Leave the keyless word the SOLE eligible candidate: pre-assign every other high-freq verb, so
    // when the rare emergence gate fires it must target the keyless id (proves it is in the pool).
    for (const id of evolvableLexemes(lang)) {
      if (id === kid) continue;
      if (effectivePosOf(lang, id) === "verb") satSet(lang, "ablautClassAssignment", id, 9);
    }

    const rng = makeRng("s2b-ablaut");
    let got = false;
    for (let i = 0; i < 3000 && !got; i++) {
      proposeAblautEmergence(lang, rng, 1);
      if (satGet(lang, "ablautClassAssignment", kid)) got = true;
    }
    expect(got).toBe(true);
  });
});
