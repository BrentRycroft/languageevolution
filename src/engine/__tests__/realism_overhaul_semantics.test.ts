import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { makeRng } from "../rng";
import { classifyShift, driftOneMeaning } from "../semantics/drift";
import { isClosedClass, posOf } from "../lexicon/pos";

/**
 * realism_overhaul_semantics.test.ts — Lane C of the realism overhaul (#3).
 *   - Zipfian frequency-retention: high-frequency meanings drift slower.
 *   - Pejoration asymmetry: evaluative change skews negative; register still
 *     modulates (a high-register source can still ameliorate).
 *
 * Behaviour tests only — the byte-identity baseline is re-based once at
 * integration (the drift changes are intentional, so it is expected red).
 */

describe("Lane C #3 — pejoration asymmetry (Traugott & Dasher)", () => {
  it("neutral register never ameliorates but does pejorate (negative evaluative bias)", () => {
    const rng = makeRng("pejoration");
    const tally: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const k = classifyShift("dog", "wolf", rng, undefined, undefined, 0.5);
      tally[k] = (tally[k] ?? 0) + 1;
    }
    // amelioration carries weight ONLY at high register, so a neutral-register
    // source can never ameliorate, while pejoration has a baseline weight.
    expect(tally["amelioration"] ?? 0).toBe(0);
    expect(tally["pejoration"] ?? 0).toBeGreaterThan(0);
  });

  it("register still modulates — a high-register source can ameliorate", () => {
    const rng = makeRng("amelioration");
    let amel = 0;
    for (let i = 0; i < 400; i++) {
      if (classifyShift("dog", "wolf", rng, "high", undefined, 0.5) === "amelioration") amel++;
    }
    expect(amel).toBeGreaterThan(0);
  });
});

describe("Lane C #3 — Zipfian frequency-retention (Pagel/Zipf)", () => {
  it("drifted meanings skew lower-frequency than the eligible-population mean", () => {
    const cfg = presetEnglish();
    cfg.seed = "overhaul-retention";
    cfg.modes = { ...cfg.modes, tree: false, death: false };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 8; i++) sim.step();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    // Snapshot frequencies BEFORE driving drift (drift mutates the lexicon).
    const snap: Record<string, number> = { ...lang.wordFrequencyHints };
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // Population baseline = mean frequency of the drift-ELIGIBLE meanings
    // (content words; closed-class never drifts). Comparing against this
    // isolates the frequency-retention law from the closed-class exclusion
    // and is independent of how many core vs peripheral words exist.
    const eligibleFreqs = Object.keys(snap)
      .filter((m) => !isClosedClass(posOf(m)))
      .map((m) => snap[m]!);
    const meanAll = avg(eligibleFreqs);
    const rng = makeRng("drift-retention");
    const driftedFreqs: number[] = [];
    for (let i = 0; i < 2500 && driftedFreqs.length < 200; i++) {
      const d = driftOneMeaning(lang, rng, undefined, 8 + i);
      if (!d) continue;
      const f = snap[d.from];
      if (f === undefined) continue; // a meaning created by an earlier drift
      driftedFreqs.push(f);
    }
    expect(driftedFreqs.length).toBeGreaterThan(20);
    // Retention: high-frequency meanings are skipped more, so the meanings
    // that actually drift carry a lower average frequency than the pool.
    expect(avg(driftedFreqs)).toBeLessThan(meanAll);
  });
});
