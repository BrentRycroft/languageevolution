import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { maybeAnalogicalLevel } from "../morphology/analogy";
import { makeRng } from "../rng";
import { tForm as lexGet, tSet as lexSet } from "../lexicon/__tests__/glossSeam";
import { satSet } from "../lexicon/satellites";

/**
 * Phase 28e: suppletive paradigms must survive long-form runs.
 * Pre-28e, `morphology/analogy.ts` levelled forms purely by length-
 * matching against semantic clusters, which would erase exactly the
 * irregularity that defines suppletion. The 28e gate skips any
 * meaning carrying a `lang.suppletion[m]` record.
 */

describe("Phase 28e — suppletion persistence", () => {
  it("maybeAnalogicalLevel skips meanings with suppletion records", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    // Synthesise a length-imbalanced suppletive form: `go` short,
    // semantic neighbours longer.
    lexSet(lang, "go", ["g", "o"]);
    satSet(lang, "suppletion", "go", { "verb.tense.past": ["w", "ɛ", "n", "t"] });
    // Force the cluster mates to be longer so the bare leveler would
    // pick `go` as a target if not gated.
    lexSet(lang, "come", ["k", "o", "m", "e", "n"]);
    lexSet(lang, "walk", ["w", "a", "l", "k", "e"]);
    lexSet(lang, "run", ["r", "u", "n", "n", "e", "n"]);
    const before = lexGet(lang, "go")!.slice();
    // Try repeatedly with high probability — should never re-shape `go`.
    for (let i = 0; i < 50; i++) {
      const rng = makeRng(`anal-${i}`);
      maybeAnalogicalLevel(lang, rng, 1.0);
    }
    expect(lexGet(lang, "go")).toEqual(before);
  });
});
