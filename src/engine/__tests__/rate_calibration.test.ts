import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";
import type { LanguageEvent } from "../types";

function countByKind(events: LanguageEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    out[e.kind] = (out[e.kind] ?? 0) + 1;
  }
  return out;
}

describe("rate calibration — 25 years per generation", () => {
  it("100 gens (2500 yrs) produces realistic phonology event counts", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "cal-100" });
    for (let i = 0; i < 100; i++) sim.step();
    const tree = sim.getState().tree;
    const leaves = leafIds(tree).filter((id) => !tree[id]!.language.extinct);
    let totalSoundChanges = 0;
    for (const id of leaves) {
      totalSoundChanges += tree[id]!.language.events
        .filter((e) => e.kind === "sound_change").length;
    }
    // Phase 38a/b: dropped lower bound from 2 → 0 per leaf because
    // stable-era freeze + literary brake can legitimately produce
    // long zero-event windows. Total across leaves still must be > 0.
    expect(totalSoundChanges, "expect ≥1 sound-change events somewhere in 100 gens").toBeGreaterThan(0);
    const perLeaf = totalSoundChanges / Math.max(1, leaves.length);
    expect(perLeaf).toBeLessThan(120);
  });

  it("100 gens produces some grammar shifts but not dozens", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "cal-gram" });
    for (let i = 0; i < 100; i++) sim.step();
    const tree = sim.getState().tree;
    const leaves = leafIds(tree).filter((id) => !tree[id]!.language.extinct);
    let totalShifts = 0;
    for (const id of leaves) {
      totalShifts += tree[id]!.language.events
        .filter((e) => e.kind === "grammar_shift").length;
    }
    const perLeaf = totalShifts / Math.max(1, leaves.length);
    expect(perLeaf, "grammar shifts per leaf in 100 gens").toBeLessThan(80);
  });

  it("100 gens — at least one tree split occurs", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "cal-split" });
    for (let i = 0; i < 100; i++) sim.step();
    const tree = sim.getState().tree;
    const total = Object.keys(tree).length;
    expect(total, "expect at least 2 nodes after 100 gens").toBeGreaterThan(1);
  });

  it("200 gens (5000 yrs) — basic vocabulary substantially diverged", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "cal-divergence" });
    const initial = { ...sim.getState().tree[sim.getState().rootId]!.language.lexicon };
    for (let i = 0; i < 200; i++) sim.step();
    const tree = sim.getState().tree;
    const leaves = leafIds(tree).filter((id) => !tree[id]!.language.extinct);
    if (leaves.length === 0) return;
    let changedWords = 0;
    let totalWords = 0;
    const leaf = tree[leaves[0]!]!.language;
    for (const m of Object.keys(initial)) {
      const orig = initial[m]!.join("");
      const cur = leaf.lexicon[m]?.join("") ?? "";
      totalWords++;
      if (cur !== orig) changedWords++;
    }
    expect(totalWords).toBeGreaterThan(0);
    const fraction = changedWords / totalWords;
    // Phase 38: stable-era freeze + literary brake means realistic
    // 5000-yr divergence is sometimes lower; relax 0.4 → 0.25.
    expect(fraction, "expect ≥25% of seed words changed in 5000 yrs").toBeGreaterThan(0.25);
  });

  it("150 gens — multiple branches alive, rich event distribution", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "cal-branching" });
    for (let i = 0; i < 150; i++) sim.step();
    const tree = sim.getState().tree;
    const leaves = leafIds(tree).filter((id) => !tree[id]!.language.extinct);
    expect(leaves.length, "expect ≥2 alive leaves after 150 gens").toBeGreaterThanOrEqual(2);
    const allEvents: LanguageEvent[] = [];
    for (const id of leaves) allEvents.push(...tree[id]!.language.events);
    const kinds = countByKind(allEvents);
    expect(kinds.sound_change ?? 0, "should accumulate sound changes").toBeGreaterThan(0);
  });
});
