import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { coinKeylessLexeme } from "../lexicon/lexemeIdentity";
import { fromFloats } from "../semantics/vec";
import { embed } from "../semantics/embeddings";
import { satGet, satSet } from "../lexicon/satellites";
import { effectivePosOf } from "../lexicon/evolvable";
import { maybeSuppletion } from "../morphology/evolve";
import { makeRng } from "../rng";
import type { Language } from "../types";

function rootLang(): Language {
  const s = createSimulation(presetEnglish()).getState();
  return s.tree[s.rootId]!.language;
}

/**
 * keyless_widen_suppletion.test.ts — S2b task 3.
 * A keyless word coined near a verb concept reads as a verb (effectivePosOf via emergent gloss) and,
 * when high-frequency, can receive a suppletive slot under its own LexemeId. Form-based → no maturity gate.
 */
describe("S2b task 3 — suppletion for keyless verbs", () => {
  it("a keyless high-freq verb can receive a suppletive slot under its id", () => {
    const lang = rootLang();
    const kid = coinKeylessLexeme(lang, fromFloats(embed("run")), ["r", "u", "n", "o"]);
    expect(effectivePosOf(lang, kid)).toBe("verb"); // precondition: emergent-gloss POS
    satSet(lang, "wordFrequencyHints", kid, 0.9);
    const rng = makeRng("s2b-suppletion");
    let got = false;
    for (let i = 0; i < 400 && !got; i++) {
      maybeSuppletion(lang, rng, 1);
      if (satGet(lang, "suppletion", kid)) got = true;
    }
    expect(got).toBe(true);
  });
});
