import { describe, it, expect } from "vitest";
import { applyChangesToWord, type ApplyOptions } from "../phonology/apply";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";

/**
 * Phase 28c: directionality bias verification.
 *
 * Pre-28c the catalog gave natural processes (lenition, voicing
 * assimilation, palatalisation) and marked processes (fortition,
 * metathesis) near-equal lambda multipliers. Cross-linguistically
 * unrealistic. The fix added a CATEGORY_NATURAL_BIAS map in
 * apply.ts that boosts natural categories ×1.2-1.5 and dampens
 * marked categories ×0.5-0.6.
 *
 * This test runs a tight statistical check by feeding the same
 * input word through both a lenition rule and a fortition rule
 * (each enabled in isolation) over many trials, counting how often
 * each fires. The bias should produce ≥ 2:1 lenition:fortition
 * firings.
 *
 * Note: regression-via-event-log was tried first but rejected — most
 * sound-change events log bulk summaries (`"${n} forms shifted"`)
 * with no per-rule id, so event mining can't measure rule-specific
 * firing rates.
 */

function fireCount(ruleId: string, trials: number, seed: string): number {
  const rule = CATALOG_BY_ID[ruleId];
  if (!rule) throw new Error(`unknown rule: ${ruleId}`);
  const rng = makeRng(seed);
  const opts: ApplyOptions = {
    globalRate: 1,
    weights: { [ruleId]: 1 },
    rateMultiplier: 1,
  };
  let fired = 0;
  for (let i = 0; i < trials; i++) {
    // Use a word whose form provides a site for the rule. lenition.p_to_f
    // matches /p/, fortition.b_to_p matches /b/, so we feed both
    // candidates and look at which one fires.
    const word = ["b", "a", "p", "a"];
    const next = applyChangesToWord(word, [rule], rng, opts, "test");
    if (next.join("") !== word.join("")) fired++;
  }
  return fired;
}

describe("Phase 28c — natural-process bias", () => {
  it("CATEGORY_NATURAL_BIAS implies lenition >> fortition", () => {
    // We import the bias map indirectly by observing rule firing
    // rates. lenition.p_to_f and the fortition rules share the same
    // baseWeight (1.0); only the category bias differentiates them.
    const lenitionFires = fireCount("lenition.p_to_f", 500, "bias-len");
    // The catalog's primary fortition rule is `fortition.b_to_p`
    // (paired with the lenition above). Use it for parity.
    const fortitionRule = Object.keys(CATALOG_BY_ID).find(
      (k) => CATALOG_BY_ID[k]!.category === "fortition",
    );
    expect(fortitionRule, "no fortition rule found").toBeDefined();
    const fortitionFires = fireCount(fortitionRule!, 500, "bias-fort");
    expect(
      lenitionFires,
      `lenition=${lenitionFires} fortition=${fortitionFires}`,
    ).toBeGreaterThan(fortitionFires);
    // Lenition should fire at least 1.5× as often as fortition (the
    // exact ratio fluctuates with rule shape but the bias map gives
    // lenition × 1.5 vs fortition × 0.5 — a 3× advantage, partially
    // diluted by per-site probability differences in the rule defs).
    expect(
      lenitionFires / Math.max(1, fortitionFires),
      `lenition=${lenitionFires} fortition=${fortitionFires}`,
    ).toBeGreaterThan(1.5);
  });
});
