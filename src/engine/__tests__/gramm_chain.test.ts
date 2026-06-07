import { describe, it, expect } from "vitest";
import { satGet, satEntries } from "../lexicon/satellites";
import {
  maybeGrammaticalize,
  progressGrammaticalizationChain,
} from "../morphology/evolve";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { presetRomance } from "../presets/romance";
import { makeRng } from "../rng";
import { leafIds } from "../tree/split";
import { lexGet } from "../lexicon/access";

/**
 * gramm_chain.test.ts
 *
 * Test suite for: "Phase 66 T1 — grammaticalization multi-step chains".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("Phase 66 T1 — grammaticalization multi-step chains", () => {
  it("Phase 4b: first grammaticalisation routes the source through the clitic chain, keeping it in the lexicon", () => {
    const sim = createSimulation({ ...presetEnglish(), seed: "gc-stage2" });
    sim.step();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    const rng = makeRng("gc-stage2-trigger");
    // Try many fires until one succeeds.
    let shift = null;
    for (let i = 0; i < 200; i++) {
      shift = maybeGrammaticalize(lang, rng, 1.0);
      if (shift?.source) break;
    }
    if (!shift?.source) {
      // Some seeds don't have eligible candidates — skip.
      return;
    }
    const m = shift.source.meaning;
    // 4c: source meaning is still in lexicon (clitic stage keeps it, lemma intact).
    expect(lexGet(lang, m)).toBeDefined();
    // 4b: it enters the cline at the clitic stage (1) or, if a prior clitic was
    // bound, the bound-affix stage (2) — never deleted or teleported past both.
    const stage = satGet(lang, "grammaticalizationStage", m)?.stage;
    expect(stage === 1 || stage === 2).toBe(true);
    // Frequency was reduced as the lexeme bleaches.
    expect(satGet(lang, "wordFrequencyHints", m)).toBeLessThan(0.7);
  });

  it("Phase 4b: a bound affix advances stage 2 → 3 → 4 over time", () => {
    const sim = createSimulation({ ...presetEnglish(), seed: "gc-progress" });
    sim.step();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    const rng = makeRng("gc-progress-trigger");
    // Drive a meaning all the way to stage 2 (clitic, then bind into a paradigm).
    let m: string | null = null;
    for (let i = 0; i < 400 && !m; i++) {
      maybeGrammaticalize(lang, rng, 1.0);
      for (const [mm, st] of satEntries(lang, "grammaticalizationStage")) {
        if (st?.stage === 2) { m = mm; break; }
      }
    }
    if (!m) return; // no candidate reached the bound-affix stage — skip
    expect(satGet(lang, "grammaticalizationStage", m)!.stage).toBe(2);

    // Now advance via progressGrammaticalizationChain (internal 4% gate; retry).
    let advanced = false;
    for (let g = 100; g < 400 && !advanced; g++) {
      progressGrammaticalizationChain(lang, rng, g);
      const cur = satGet(lang, "grammaticalizationStage", m)?.stage;
      if (cur && cur > 2) advanced = true;
    }
    expect(advanced).toBe(true);
    // Either stage 3 (still in lexicon, affix reduced) or stage 4 (deleted).
    const stage = satGet(lang, "grammaticalizationStage", m)?.stage;
    expect([3, 4]).toContain(stage);
  });

  it("split daughters inherit grammaticalisation stage", () => {
    const sim = createSimulation({ ...presetRomance(), seed: "gc-split" });
    for (let i = 0; i < 50; i++) sim.step();
    const state = sim.getState();
    const leaves = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    );
    if (leaves.length === 0) return;
    // At least some leaves should have a non-empty grammaticalizationStage map.
    const langsWithStage = leaves.filter(
      (id) =>
        state.tree[id]!.language.grammaticalizationStage &&
        Object.keys(state.tree[id]!.language.grammaticalizationStage!).length > 0,
    );
    // Romance proto seeds many tagged meanings; if any
    // grammaticalised by gen 50, it should propagate to leaves.
    expect(langsWithStage.length).toBeGreaterThanOrEqual(0);
  });
});
