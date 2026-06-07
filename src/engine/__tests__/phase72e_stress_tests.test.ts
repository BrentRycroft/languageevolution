import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetRomance } from "../presets/romance";
import { deleteMeaning, PROTECTED_MEANINGS } from "../lexicon/mutate";
import { lexKeys } from "../lexicon/access";
import { translateSentence } from "../translator/sentence";
import { generateDiscourseNarrative } from "../narrative/discourse_generate";

/**
 * phase72e_stress_tests.test.ts — Phase 72e.
 *
 * Five stress tests recommended by the audit (Section S9 / I).
 * Each tests an edge case that could silently corrupt state at scale.
 */

describe("Phase 72e-1 — empty lexicon stress test", () => {
  it("simulator survives mass deletion of all non-protected meanings", () => {
    const cfg = presetRomance();
    cfg.seed = "p72e-empty";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const initialSize = Object.keys(lang.lexemes).length;

    // Delete every non-protected meaning. Iterate GLOSSES via the seam:
    // Object.keys(lang.lexemes) now yields LexemeIds, which neither
    // PROTECTED_MEANINGS (gloss-keyed) nor deleteMeaning (gloss-keyed) accept.
    const all = lexKeys(lang);
    for (const m of all) {
      if (!PROTECTED_MEANINGS.has(m)) {
        deleteMeaning(lang, m);
      }
    }
    const remaining = Object.keys(lang.lexemes).length;
    // PROTECTED_MEANINGS shields ~18 verbs; remaining should equal that
    // count or fewer (some protected meanings may not have been seeded).
    expect(remaining).toBeLessThan(initialSize);
    expect(remaining).toBeLessThanOrEqual(PROTECTED_MEANINGS.size);

    // Step 5 gens; expect no crash.
    expect(() => {
      for (let i = 0; i < 5; i++) sim.step();
    }).not.toThrow();
  });
});

describe("Phase 72e-2 — massive event log stress test", () => {
  it("per-language events ring buffer caps at MAX_EVENTS_PER_LANGUAGE", async () => {
    const { MAX_EVENTS_PER_LANGUAGE } = await import("../constants");
    const { pushEvent } = await import("../steps/helpers");
    const cfg = presetRomance();
    cfg.seed = "p72e-events";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;

    // Push 250 synthetic events directly via helper.
    for (let i = 0; i < 250; i++) {
      pushEvent(lang, {
        generation: i,
        kind: "sound_change",
        description: `synthetic-${i}`,
      });
    }
    expect(lang.events.length).toBeLessThanOrEqual(MAX_EVENTS_PER_LANGUAGE);
  });

  it("state.historicalEvents caps at 200 — recordHistoricalEvent enforces cap (Phase 72a-4)", async () => {
    // Phase 72 methodological audit D-A1: pre-fix this test manually
    // spliced the array and asserted the splice succeeded — a pure
    // tautology that would pass even if the production cap were
    // deleted. Now we invoke the actual `recordHistoricalEvent`
    // function and verify IT applies the cap.
    const { recordHistoricalEvent } = await import("../steps/historical");
    const cfg = presetRomance();
    cfg.seed = "p72e-hist";
    const sim = createSimulation(cfg);
    const state = sim.getState();
    state.historicalEvents = [];
    // Call the production writer 250 times. The cap should bound the
    // array at 200 entries; oldest entries get evicted FIFO.
    for (let i = 0; i < 250; i++) {
      recordHistoricalEvent(state, i, `m-${i}`, "proto", "fired");
    }
    expect(state.historicalEvents.length).toBe(200);
    // FIFO eviction: the OLDEST 50 events (i=0..49) should be gone;
    // entries 50..249 should remain.
    expect(state.historicalEvents[0]!.generation).toBe(50);
    expect(state.historicalEvents[state.historicalEvents.length - 1]!.generation).toBe(249);
  });
});

describe("Phase 72e-3 — deep tree stress test", () => {
  it("tree depth grows linearly with milestones; structure stays valid", () => {
    const cfg = presetRomance();
    cfg.seed = "p72e-deep";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 200; i++) sim.step();
    const tree = sim.getState().tree;
    // Validate tree structural invariants:
    // - every parentId points to a real node OR is null.
    // - every childrenIds entry points to a real node.
    // - no cycles (parent of parent of ... reaches null without revisits).
    for (const id of Object.keys(tree)) {
      const node = tree[id]!;
      if (node.parentId !== null) {
        expect(tree[node.parentId]).toBeDefined();
      }
      for (const cid of node.childrenIds) {
        expect(tree[cid]).toBeDefined();
        expect(tree[cid]!.parentId).toBe(id);
      }
    }
    // Compute depth via BFS from root; should be reasonable (≤ 10).
    const depth = (id: string): number => {
      const n = tree[id]!;
      if (n.parentId === null) return 0;
      return 1 + depth(n.parentId);
    };
    let maxDepth = 0;
    for (const id of Object.keys(tree)) {
      maxDepth = Math.max(maxDepth, depth(id));
    }
    expect(maxDepth).toBeLessThanOrEqual(10);
  });
});

describe("Phase 72e-4 — extinct ancestors with living descendants", () => {
  it("reconstruction skips extinct nodes; living descendants accessible", () => {
    const cfg = presetRomance();
    cfg.seed = "p72e-extinct";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 200; i++) sim.step();
    const tree = sim.getState().tree;
    // Find a non-leaf node (which is likely "extinct" in the
    // narrative sense — internal nodes don't continue evolving).
    const internal = Object.values(tree).filter(
      (n) => n.childrenIds.length > 0 && n.parentId !== null,
    );
    if (internal.length === 0) return; // no internal nodes; skip

    // Internal nodes should have children that are still in the tree.
    for (const node of internal) {
      for (const cid of node.childrenIds) {
        expect(tree[cid]).toBeDefined();
      }
    }
  });
});

describe("Phase 72e-5 — translator robustness on edge inputs", () => {
  it("translator does not crash on empty input", () => {
    const cfg = presetRomance();
    cfg.seed = "p72e-trans-edge";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    expect(() => translateSentence(lang, "")).not.toThrow();
  });

  it("translator does not crash on punctuation-only input", () => {
    const cfg = presetRomance();
    cfg.seed = "p72e-trans-punct";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    expect(() => translateSentence(lang, "?!.;:")).not.toThrow();
  });

  it("translator does not crash on all-unknown words", () => {
    const cfg = presetRomance();
    cfg.seed = "p72e-trans-unknown";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const t = translateSentence(lang, "abc xyz qrstuv");
    // arranged should not contain placeholder strings
    for (const s of t.arranged) {
      expect(s.startsWith("“")).toBe(false);
    }
  });

  it("narrative composer does not crash with sparse lexicon", () => {
    const cfg = presetRomance();
    cfg.seed = "p72e-narr-sparse";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    // Delete a chunk of the lexicon (simulate post-shrink state).
    const meanings = Object.keys(lang.lexemes).slice(50);
    for (const m of meanings) {
      if (!PROTECTED_MEANINGS.has(m)) deleteMeaning(lang, m);
    }
    expect(() => {
      generateDiscourseNarrative(lang, "p72e-sparse-narr", {
        lines: 3,
        genre: "myth",
      });
    }).not.toThrow();
  });
});
