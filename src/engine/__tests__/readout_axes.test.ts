import { describe, it, expect } from "vitest";
import {
  projectOnAxis,
  readoutProfile,
  axisBias,
  READOUT_AXES,
} from "../semantics/readoutAxes";

/**
 * MEGA overhaul (hybrid meaning model): the interpretable readout layer over the dense
 * embedding. Each axis is a pole-difference direction; projecting a concept onto it
 * gives a signed, bounded reading. The layer is opt-in — `axisBias(..., enabled=false)`
 * is the identity, so the engine stays pure-dense until a caller turns it on.
 */
describe("semantic readout axes (hybrid layer)", () => {
  it("poles project to opposite signs on their own axis", () => {
    for (const [axis, [pos, neg]] of Object.entries(READOUT_AXES)) {
      const p = projectOnAxis(pos, axis as never);
      const n = projectOnAxis(neg, axis as never);
      expect(p, `${axis}: ${pos} should outscore ${neg}`).toBeGreaterThan(n);
    }
  });

  it("readings are bounded in [-1, 1]", () => {
    const prof = readoutProfile("water");
    for (const v of Object.values(prof)) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("valence places 'good' above 'bad'", () => {
    expect(projectOnAxis("good", "valence")).toBeGreaterThan(
      projectOnAxis("bad", "valence"),
    );
  });

  it("axisBias is the identity when disabled (pure-dense default)", () => {
    expect(axisBias("good", "valence", 0.5, false)).toBe(1);
    expect(axisBias("bad", "valence", 0.5, false)).toBe(1);
  });

  it("axisBias nudges away from 1 by the meaning's pole position when enabled", () => {
    const good = axisBias("good", "valence", 0.3, true);
    const bad = axisBias("bad", "valence", 0.3, true);
    expect(good).toBeGreaterThan(bad);
    // strength 0 is always identity even when enabled
    expect(axisBias("good", "valence", 0, true)).toBe(1);
  });
});
