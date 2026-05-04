import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { presetRomance } from "../presets/romance";
import { presetTokipona } from "../presets/tokipona";
import { translateSentence } from "../translator/sentence";
import { leafIds } from "../tree/split";

/**
 * Phase 29 Tranche 7c: snapshot tests for the narrative pipeline.
 *
 * Locks in deterministic translator + grammar output for a fixed
 * (preset, seed, sentence) tuple. When the engine drifts, these
 * tests fail loudly; CI then forces an explicit acknowledgement
 * (update the snapshot) rather than the drift sneaking through.
 *
 * The seed and sentence list are intentionally small so failures are
 * cheap to diff; the assertion is on the surface form (target language
 * tokens joined by space). Morphology + word-order + closed-class
 * pathways all flow through this surface, so any regression in those
 * produces a snapshot diff.
 */

const SENTENCES = [
  "the king sees the wolf",
  "the dogs see the wolves",
  "i give you the bread",
  "the king walks at the river",
  "the king does not see the wolf",
];

interface Snap {
  preset: string;
  generation: number;
  outputs: Array<{ english: string; target: string }>;
}

function takeSnapshot(
  preset: string,
  buildConfig: () => ReturnType<typeof presetEnglish>,
  steps: number,
): Snap {
  const sim = createSimulation({ ...buildConfig(), seed: `snap-${preset}` });
  for (let i = 0; i < steps; i++) sim.step();
  const state = sim.getState();
  const leaves = leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  );
  // Deterministic leaf pick: pick the lowest-id alive leaf so the
  // snapshot doesn't drift when split order changes.
  leaves.sort();
  const leafId = leaves[0] ?? state.rootId;
  const lang = state.tree[leafId]!.language;
  const outputs: Array<{ english: string; target: string }> = [];
  for (const s of SENTENCES) {
    const translated = translateSentence(lang, s);
    const target = translated.targetTokens
      .map((t) => t.targetSurface ?? "")
      .filter((t) => t.length > 0)
      .join(" ");
    outputs.push({ english: s, target });
  }
  return { preset, generation: state.generation, outputs };
}

describe("Phase 29 Tranche 7c — narrative snapshot stability", () => {
  it("English preset translator output (30 gens) is stable", () => {
    const snap = takeSnapshot("english", presetEnglish, 30);
    expect(snap).toMatchSnapshot();
  });

  it("Romance preset translator output (30 gens) is stable", () => {
    const snap = takeSnapshot("romance", presetRomance, 30);
    expect(snap).toMatchSnapshot();
  });

  it("Toki Pona preset translator output (30 gens) is stable", () => {
    const snap = takeSnapshot("tokipona", presetTokipona, 30);
    expect(snap).toMatchSnapshot();
  });
});
