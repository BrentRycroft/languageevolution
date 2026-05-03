import { describe, it, expect } from "vitest";
import { driftOneMeaning } from "../semantics/drift";
import { maybeTabooReplace } from "../lexicon/taboo";
import { maybeAnalogicalLevel } from "../morphology/analogy";
import { maybeGrammaticalize } from "../morphology/evolve";
import { lexicalNeed } from "../genesis/need";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { makeRng } from "../rng";
import { isClosedClass, posOf } from "../lexicon/pos";

function freshLang() {
  const sim = createSimulation(presetEnglish());
  return sim.getState();
}

describe("Phase 26c — closed-class protection", () => {
  it("driftOneMeaning skips closed-class meanings (the/and/of/to/...)", () => {
    const state = freshLang();
    const lang = state.tree[state.rootId]!.language;
    const rng = makeRng("drift-closed");
    // Run drift many times. Track which meanings drift.
    const drifted: Set<string> = new Set();
    for (let i = 0; i < 200; i++) {
      const ev = driftOneMeaning(lang, rng, {});
      if (ev) drifted.add(ev.from);
    }
    // No drifted meaning should be a closed-class word.
    for (const m of drifted) {
      const closed = isClosedClass(posOf(m));
      expect(closed, `drift fired on closed-class word: ${m}`).toBe(false);
    }
  });

  it("maybeTabooReplace skips closed-class meanings", () => {
    const state = freshLang();
    const lang = state.tree[state.rootId]!.language;
    // Boost frequency of every closed-class word to make it a candidate.
    for (const m of Object.keys(lang.lexicon)) {
      if (isClosedClass(posOf(m))) {
        lang.wordFrequencyHints[m] = 0.95;
      }
    }
    const rng = makeRng("taboo-closed");
    const targets: Set<string> = new Set();
    for (let i = 0; i < 200; i++) {
      const ev = maybeTabooReplace(lang, rng, 1.0); // probability 1
      if (ev) targets.add(ev.meaning);
    }
    for (const m of targets) {
      const closed = isClosedClass(posOf(m));
      expect(closed, `taboo fired on closed-class word: ${m}`).toBe(false);
    }
  });

  it("maybeAnalogicalLevel skips closed-class meanings", () => {
    const state = freshLang();
    const lang = state.tree[state.rootId]!.language;
    const rng = makeRng("analogy-closed");
    const targets: Set<string> = new Set();
    for (let i = 0; i < 100; i++) {
      const ev = maybeAnalogicalLevel(lang, rng, 1.0);
      if (ev) targets.add(ev.meaning);
    }
    for (const m of targets) {
      const closed = isClosedClass(posOf(m));
      expect(closed, `analogy fired on closed-class word: ${m}`).toBe(false);
    }
  });

  it("maybeGrammaticalize skips closed-class source meanings", () => {
    const state = freshLang();
    const lang = state.tree[state.rootId]!.language;
    // Boost a few closed-class words' frequencies.
    for (const m of Object.keys(lang.lexicon)) {
      if (isClosedClass(posOf(m))) {
        lang.wordFrequencyHints[m] = 0.95;
      }
    }
    const rng = makeRng("gramm-closed");
    const sources: Set<string> = new Set();
    for (let i = 0; i < 100; i++) {
      const ev = maybeGrammaticalize(lang, rng, 1.0);
      if (ev?.source?.meaning) sources.add(ev.source.meaning);
    }
    for (const m of sources) {
      const closed = isClosedClass(posOf(m));
      expect(closed, `grammaticalisation source was closed-class: ${m}`).toBe(false);
    }
  });

  it("lexicalNeed shrinkage component skips closed-class meanings", () => {
    const state = freshLang();
    const lang = state.tree[state.rootId]!.language;
    // Build seedLengths and force one closed-class word to be eroded.
    const seedLengths: Record<string, number> = {};
    for (const m of Object.keys(lang.lexicon)) {
      seedLengths[m] = lang.lexicon[m]!.length;
    }
    // Pick a closed-class meaning, manually erode it to length 1, set
    // its frequency high. Pre-Phase-26c, this would set a positive
    // shrinkage need score. Post-26c, score should be zero.
    const closedM = Object.keys(lang.lexicon).find((m) => isClosedClass(posOf(m)));
    expect(closedM).toBeDefined();
    lang.lexicon[closedM!] = ["x"]; // length 1, way under floor
    lang.wordFrequencyHints[closedM!] = 0.95;
    const need = lexicalNeed(lang, state.tree, { seedLengths });
    expect(need[closedM!] ?? 0).toBe(0);
  });

  it("open-class words are NOT protected by closed-class gates", () => {
    // Sanity: drift can still fire on open-class meanings.
    const state = freshLang();
    const lang = state.tree[state.rootId]!.language;
    const rng = makeRng("drift-open");
    let openDriftFired = false;
    for (let i = 0; i < 200 && !openDriftFired; i++) {
      const ev = driftOneMeaning(lang, rng, {});
      if (ev && !isClosedClass(posOf(ev.from))) openDriftFired = true;
    }
    // We expect SOME open-class drift over 200 attempts (drift rate is
    // generally non-zero).
    expect(openDriftFired).toBe(true);
  });
});
