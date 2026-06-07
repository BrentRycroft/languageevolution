import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { keylessGloss } from "../lexicon/lexemeIdentity";
import { keylessRecords } from "../lexicon/store";
import type { SimulationConfig } from "../types";

/**
 * Inc 4 step 3 — keyless gap-coinage is wired into the genesis loop. These tests prove the
 * point-native storage path actually fires during evolution (real, not inert) and stays
 * deterministic. Keyless lexemes live as gloss-less records in lang.lexemes (no concept/gloss key);
 * their label is emergent (nearest anchor).
 *
 * RUN_SLOW-gated: each case steps a full enriched preset 30 generations (~18s), the same heavy
 * trajectory the meaning_layer_baseline RUN_SLOW tier locks. The component pieces (findSemanticGap,
 * coinKeylessForGap) are covered cheaply in the FAST tier by semantic_gap / keyless_gap_coinage.
 */
const RUN_SLOW = !!(globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.RUN_SLOW;

function countKeyless(sim: ReturnType<typeof createSimulation>): number {
  const tree = sim.getState().tree;
  let n = 0;
  for (const id of Object.keys(tree)) {
    n += keylessRecords(tree[id]!.language.lexemes).length;
  }
  return n;
}

function keylessFormsSorted(sim: ReturnType<typeof createSimulation>): string[] {
  const tree = sim.getState().tree;
  const forms: string[] = [];
  for (const id of Object.keys(tree).sort()) {
    for (const r of keylessRecords(tree[id]!.language.lexemes)) forms.push(r.form.join(""));
  }
  return forms.sort();
}

function run30(build: () => SimulationConfig): ReturnType<typeof createSimulation> {
  const sim = createSimulation(build());
  for (let i = 0; i < 30; i++) sim.step();
  return sim;
}

describe("keyless gap-coinage fires during evolution (inc 4 step 3)", () => {
  it.skipIf(!RUN_SLOW)("coins at least one keyless lexeme over a 30-gen English run", () => {
    expect(countKeyless(run30(presetEnglish))).toBeGreaterThan(0);
  });

  it.skipIf(!RUN_SLOW)("is deterministic — same config yields the same keyless forms", () => {
    expect(keylessFormsSorted(run30(presetEnglish))).toEqual(
      keylessFormsSorted(run30(presetEnglish)),
    );
  });

  it.skipIf(!RUN_SLOW)("a coined keyless lexeme carries an emergent gloss (nearest anchor)", () => {
    const tree = run30(presetEnglish).getState().tree;
    let checked = 0;
    for (const id of Object.keys(tree)) {
      for (const r of keylessRecords(tree[id]!.language.lexemes)) {
        const g = keylessGloss(r);
        expect(typeof g).toBe("string");
        expect(g.length).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
