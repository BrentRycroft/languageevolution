import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { maybeExpandInventory } from "../tree/inventoryExpansion";
import { makeRng } from "../rng";
import type { Language, TypologicalDirection } from "../types";

/**
 * Phase 73d Tier D Phase D4 — inventory expansion at founder events.
 *
 * Daughter founder events can ADD a phoneme series (palatalized,
 * aspirated, voiced-aspirated, retroflex, ejective, pharyngeal)
 * by installing a `GeneratedRule` that promotes a contextual
 * allophone. Phonemes are tagged with provenance `"founder-addition"`.
 *
 * Selection is direction-weighted: palatalization-positive →
 * palatalized; simplification-negative → aspirated /
 * voiced-aspirated / retroflex / ejective.
 */

function freshLang(seed: string): Language {
  const sim = createSimulation({ ...defaultConfig(), seed });
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 73d D4 — inventory expansion at founder", () => {
  it("palatalization-positive direction tends to add palatalized series", () => {
    const direction: TypologicalDirection = {
      simplification: 0,
      palatalization: 0.9,
      synthesis: 0,
    };
    let palatalizedCount = 0;
    let totalFired = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const lang = freshLang(`d4-pal-${i}`);
      const rng = makeRng(`d4-pal-rng-${i}`);
      const desc = maybeExpandInventory(lang, direction, rng, 1);
      if (desc) {
        totalFired++;
        if (desc.includes("palatalized")) palatalizedCount++;
      }
    }
    expect(totalFired, `expansion fire count ${totalFired}/${N}`).toBeGreaterThan(15);
    expect(palatalizedCount / totalFired, `palatalized share ${palatalizedCount}/${totalFired}`).toBeGreaterThanOrEqual(0.30);
  });

  it("simplification-negative direction tends to add fortition-type series (aspirated / voiced-aspirated / retroflex / ejective)", () => {
    const direction: TypologicalDirection = {
      simplification: -0.9,
      palatalization: 0,
      synthesis: 0,
    };
    let fortitionTypes = 0;
    let totalFired = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const lang = freshLang(`d4-fort-${i}`);
      const rng = makeRng(`d4-fort-rng-${i}`);
      const desc = maybeExpandInventory(lang, direction, rng, 1);
      if (desc) {
        totalFired++;
        if (/aspirated|retroflex|ejective/.test(desc)) fortitionTypes++;
      }
    }
    expect(totalFired).toBeGreaterThan(15);
    expect(fortitionTypes / totalFired).toBeGreaterThanOrEqual(0.50);
  });

  it("appended GeneratedRule lands in lang.activeRules with founder templateId", () => {
    const lang = freshLang("d4-rule");
    const direction: TypologicalDirection = {
      simplification: -0.8,
      palatalization: 0.5,
      synthesis: 0,
    };
    const startRuleCount = (lang.activeRules ?? []).length;
    // Run many trials; at least one expansion should fire.
    let fired = false;
    for (let i = 0; i < 30; i++) {
      const rng = makeRng(`d4-rule-${i}`);
      const desc = maybeExpandInventory(lang, direction, rng, 1);
      if (desc) {
        fired = true;
        break;
      }
    }
    expect(fired).toBe(true);
    expect((lang.activeRules ?? []).length).toBeGreaterThan(startRuleCount);
    const founderRule = (lang.activeRules ?? []).find((r) => r.templateId.startsWith("founder-"));
    expect(founderRule).toBeDefined();
  });

  it("added phonemes are tagged with provenance 'founder-addition'", () => {
    const lang = freshLang("d4-prov");
    const direction: TypologicalDirection = {
      simplification: -0.8,
      palatalization: 0.5,
      synthesis: 0,
    };
    for (let i = 0; i < 30; i++) {
      const rng = makeRng(`d4-prov-${i}`);
      const desc = maybeExpandInventory(lang, direction, rng, 5);
      if (desc) break;
    }
    expect(lang.inventoryProvenance).toBeDefined();
    const founderAdditions = Object.entries(lang.inventoryProvenance!)
      .filter(([, v]) => v.source === "founder-addition");
    expect(founderAdditions.length).toBeGreaterThan(0);
    for (const [, v] of founderAdditions) {
      expect(v.generation).toBeGreaterThanOrEqual(1);
    }
  });

  it("no direction provided → no expansion", () => {
    const lang = freshLang("d4-none");
    const rng = makeRng("d4-none-rng");
    for (let i = 0; i < 20; i++) {
      const r = maybeExpandInventory(lang, undefined, rng, 1);
      expect(r).toBeNull();
    }
  });

  it("inventory cap respected — never expand past phonemeTarget + 8", () => {
    const lang = freshLang("d4-cap");
    lang.phonemeTarget = lang.phonemeInventory.segmental.length;
    // Pad inventory so it's already at the cap.
    const cap = lang.phonemeTarget + 8;
    while (lang.phonemeInventory.segmental.length < cap) {
      lang.phonemeInventory.segmental.push(`x${lang.phonemeInventory.segmental.length}`);
    }
    const direction: TypologicalDirection = {
      simplification: -0.9,
      palatalization: 0.5,
      synthesis: 0,
    };
    // Should never fire because cap is reached.
    let fired = 0;
    for (let i = 0; i < 50; i++) {
      const rng = makeRng(`d4-cap-${i}`);
      if (maybeExpandInventory(lang, direction, rng, 1) !== null) fired++;
    }
    expect(fired).toBe(0);
  });
});
