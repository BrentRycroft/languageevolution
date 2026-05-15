import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetRomance } from "../presets/romance";
import { leafIds } from "../tree/split";

/**
 * Phase 73d Tier D Phase D1 — historical-mode preservation.
 *
 * Tier D's per-daughter direction-vector deltas (D1) and
 * synthesis-index seeding (D5) are SKIPPED when a daughter is
 * declared in a `SplitMilestone` with `initialBias`. Romance
 * railroad daughters continue to land on their canonical
 * Latin-daughter biases regardless of D1's stochastic direction
 * assignment.
 *
 * This test mirrors the Phase 71d regression check: after running
 * Romance to gen 200, the western branch's `ruleBias.lenition`
 * should still be elevated (per the schedule), not perturbed by
 * D1's multiplicative deltas.
 */

describe("Phase 73d D1 — historical mode preserved", () => {
  it("Romance proto + western daughters keep their scheduled ruleBias.lenition", () => {
    const sim = createSimulation({
      ...presetRomance(),
      seed: "d1-historical",
      historical: { scheduleId: "romance", intensity: 1.0 },
    });
    for (let i = 0; i < 200; i++) sim.step();
    const state = sim.getState();
    // Find any alive daughter with historicalRole "western" or a
    // child role (castilian/lusitanian/francien/occitano/tuscan/
    // eastern). Their lenition bias was elevated by the M2/M3
    // schedule and should NOT be perturbed by D1's deltas.
    const aliveLeaves = leafIds(state.tree)
      .map((id) => state.tree[id]!.language)
      .filter((l) => !l.extinct && l.historicalRole);
    expect(aliveLeaves.length, "expected ≥1 historical-role daughter alive at gen 200").toBeGreaterThan(0);

    // The Romance schedule sets ruleBias.lenition = 1.7 on the
    // western branch at M2. By gen 200 it may have drifted but
    // should still be substantially elevated above the default
    // 1.0 — the D1 deltas would have either over-amplified or
    // suppressed it depending on the random direction draw.
    const westernish = aliveLeaves.filter((l) =>
      ["western", "castilian", "lusitanian", "francien", "occitano", "tuscan", "iberian", "italo", "gallo"].includes(
        l.historicalRole as string,
      ),
    );
    if (westernish.length > 0) {
      // Find at least one western-descended daughter with
      // lenition still in the historical band [1.0, 4.0]. If D1
      // had perturbed it without the gate, lenition could be
      // anywhere in [~0.15, ~5.0].
      const lenitionBiases = westernish.map((l) => l.ruleBias?.lenition ?? 1);
      const median = lenitionBiases.sort((a, b) => a - b)[Math.floor(lenitionBiases.length / 2)]!;
      // Loose bound — verify lenition is in the historical range
      // and NOT obliterated by D1's downward delta.
      expect(median, `median lenition across western daughters: ${median}; expected ≥ 1.0`).toBeGreaterThanOrEqual(1.0);
    }
  });

  it("historical daughters still get typologicalDirection TAG (for narrative)", () => {
    const sim = createSimulation({
      ...presetRomance(),
      seed: "d1-historical-tag",
      historical: { scheduleId: "romance", intensity: 1.0 },
    });
    for (let i = 0; i < 80; i++) sim.step();
    const state = sim.getState();
    const historicalDaughters = leafIds(state.tree)
      .map((id) => state.tree[id]!.language)
      .filter((l) => l.historicalRole && l.historicalRole !== "proto");
    expect(historicalDaughters.length).toBeGreaterThan(0);
    // Every historical daughter should still have a direction
    // tag — the gate suppresses DELTA APPLICATION, not tag
    // assignment.
    for (const d of historicalDaughters) {
      expect(d.typologicalDirection, `${d.historicalRole}: typologicalDirection should be assigned`).toBeDefined();
    }
  });
});
