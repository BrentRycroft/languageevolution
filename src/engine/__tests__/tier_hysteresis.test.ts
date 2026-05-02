import { describe, it, expect } from "vitest";
import { applyTierHysteresis, TIER_HYSTERESIS_TICKS } from "../lexicon/tier";

describe("applyTierHysteresis", () => {
  it("does not promote on the first tick of eligibility", () => {
    const r = applyTierHysteresis(0, 1, 0);
    expect(r.promoted).toBe(false);
    expect(r.nextTier).toBe(0);
    expect(r.nextStreak).toBe(1);
  });

  it("promotes once the streak reaches the threshold", () => {
    let streak = 0;
    let tier: 0 | 1 | 2 | 3 = 0;
    for (let i = 0; i < TIER_HYSTERESIS_TICKS; i++) {
      const r = applyTierHysteresis(tier, 1, streak);
      streak = r.nextStreak;
      tier = r.nextTier;
      if (r.promoted) {
        expect(i + 1).toBe(TIER_HYSTERESIS_TICKS);
        expect(tier).toBe(1);
        expect(streak).toBe(0);
        return;
      }
    }
    throw new Error("expected promotion within threshold");
  });

  it("resets the streak when eligibility drops back to current tier", () => {
    const r1 = applyTierHysteresis(0, 1, 0);
    expect(r1.nextStreak).toBe(1);
    const r2 = applyTierHysteresis(0, 0, r1.nextStreak);
    expect(r2.promoted).toBe(false);
    expect(r2.nextTier).toBe(0);
    expect(r2.nextStreak).toBe(0);
  });

  it("never demotes — candidate < prior keeps prior tier and clears streak", () => {
    // (Defensive: computeTierCandidate is one-way, but the helper should still be safe.)
    const r = applyTierHysteresis(2, 1, 5);
    expect(r.promoted).toBe(false);
    expect(r.nextTier).toBe(2);
    expect(r.nextStreak).toBe(0);
  });

  it("a one-off spike followed by a drop never promotes", () => {
    // tick 1: eligible, streak goes 0→1, no promotion (since hysteresis ≥ 2).
    const r1 = applyTierHysteresis(0, 1, 0);
    expect(r1.promoted).toBe(false);
    expect(r1.nextStreak).toBe(1);
    // tick 2: eligibility ends, streak resets to 0.
    const r2 = applyTierHysteresis(0, 0, r1.nextStreak);
    expect(r2.promoted).toBe(false);
    expect(r2.nextStreak).toBe(0);
    // tick 3: eligible again, streak goes 0→1 again, still no promotion.
    const r3 = applyTierHysteresis(0, 1, r2.nextStreak);
    expect(r3.promoted).toBe(false);
    expect(r3.nextStreak).toBe(1);
  });

  it("TIER_HYSTERESIS_TICKS is at least 2 (otherwise hysteresis is a no-op)", () => {
    expect(TIER_HYSTERESIS_TICKS).toBeGreaterThanOrEqual(2);
  });
});
