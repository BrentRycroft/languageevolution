import { describe, it } from "vitest";
import { createSimulation } from "../simulation";
import { PRESETS } from "../presets";
import { leafIds } from "../tree/split";
import { defaultConfig } from "../config";

/**
 * concept_smoke.test.ts
 *
 * Test suite for: "concept-dictionary integration smoke test".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

interface LeafReport {
  id: string;
  name: string;
  alive: boolean;
  age: number;
  speakers: number;
  tier: number;
  capacity: number;
  lexSize: number;
  coinages: number;
  recarveMerges: number;
  recarveSplits: number;
  tierEvents: number;
  colexifiedSlots: number;
  exampleColex: string[];
}

function reportLeaf(state: ReturnType<ReturnType<typeof createSimulation>["getState"]>, id: string): LeafReport {
  const lang = state.tree[id]!.language;
  const events = lang.events;
  let coinages = 0,
    recarveMerges = 0,
    recarveSplits = 0,
    tierEvents = 0;
  for (const e of events) {
    if (e.kind === "coinage") coinages++;
    if (e.kind === "semantic_drift") {
      if (e.description.startsWith("recarve-merge")) recarveMerges++;
      else if (e.description.startsWith("recarve-split")) recarveSplits++;
    }
    if (e.kind === "grammar_shift" && e.description.startsWith("cultural tier:")) {
      tierEvents++;
    }
  }
  const colex = lang.colexifiedAs ?? {};
  const exampleColex = Object.entries(colex).slice(0, 3).map(
    ([w, vs]) => `${w}={${[w, ...vs].join("|")}}`,
  );
  return {
    id: lang.id,
    name: lang.name,
    alive: !lang.extinct,
    age: state.generation - lang.birthGeneration,
    speakers: lang.speakers ?? 0,
    tier: lang.culturalTier ?? 0,
    capacity: lang.lexicalCapacity ?? -1,
    lexSize: Object.keys(lang.lexemes).length,
    coinages,
    recarveMerges,
    recarveSplits,
    tierEvents,
    colexifiedSlots: Object.keys(colex).length,
    exampleColex,
  };
}

function runPreset(presetId: string, generations: number): {
  preset: string;
  generation: number;
  leaves: LeafReport[];
  totalRecarves: number;
  highestTier: number;
} {
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const config = preset.build();
  const sim = createSimulation({ ...config, seed: `smoke-${presetId}` });
  for (let i = 0; i < generations; i++) sim.step();
  const state = sim.getState();
  const leaves = leafIds(state.tree).map((id) => reportLeaf(state, id));
  const totalRecarves = leaves.reduce(
    (s, l) => s + l.recarveMerges + l.recarveSplits,
    0,
  );
  const highestTier = leaves.reduce((m, l) => Math.max(m, l.tier), 0);
  return {
    preset: presetId,
    generation: state.generation,
    leaves,
    totalRecarves,
    highestTier,
  };
}

describe("concept-dictionary integration smoke test", () => {
  it.each(PRESETS.map((p) => p.id))("preset %s runs cleanly", (presetId) => {
    // 60 generations is plenty to exercise coinage / recarve / tier /
    // colexification and to surface a crash or a lexicon that collapses
    // or bloats. This is a SMOKE test — the multi-hundred-generation
    // long-run sanity surface lives in the RUN_SLOW tier (smoke_2k,
    // rate_calibration). Pre-fix this ran 800 gens × every preset and
    // was ~60% of the ENTIRE suite's runtime on its own.
    const result = runPreset(presetId, 60);
    // eslint-disable-next-line no-console
    console.log(
      `\n=== ${presetId} @ gen ${result.generation} ===\n` +
        `  alive leaves: ${result.leaves.filter((l) => l.alive).length}/${result.leaves.length}\n` +
        `  highest tier: ${result.highestTier}\n` +
        `  total recarves: ${result.totalRecarves}\n`,
    );
    for (const l of result.leaves) {
      if (!l.alive) continue;
      // eslint-disable-next-line no-console
      console.log(
        `    ${l.name.padEnd(14)} t=${l.tier} pop=${l.speakers} ` +
          `lex=${l.lexSize}/${l.capacity} ` +
          `coin=${l.coinages} recarve=${l.recarveMerges}M+${l.recarveSplits}S ` +
          `tierUp=${l.tierEvents}` +
          (l.exampleColex.length > 0 ? ` colex=${l.exampleColex.join(",")}` : ""),
      );
    }
    const alive = result.leaves.filter((l) => l.alive);
    if (alive.length === 0) throw new Error(`${presetId}: no alive leaves at gen ${result.generation}`);
    for (const l of alive) {
      if (l.lexSize > 3 * l.capacity) {
        throw new Error(
          `${presetId}/${l.name}: lex ${l.lexSize} > 3× capacity ${l.capacity} (capacity throttle failed)`,
        );
      }
    }
    for (const l of alive) {
      if (l.lexSize < 20) {
        throw new Error(
          `${presetId}/${l.name}: lex collapsed to ${l.lexSize} entries`,
        );
      }
    }
  });

  it("a language advances cultural tier as its population sustains the floor", () => {
    // Tier advancement is population-driven: the tier-1 floor is 5,000
    // speakers, evaluated every 20 gens with 2-tick hysteresis (~40 gens
    // of sustained eligibility). The seed starts at 10,000 speakers and
    // settles toward the tier-0 cap of 6,000 — comfortably above the
    // floor — so a non-splitting lineage advances to tier 1 within tens
    // of generations.
    //
    // Pre-fix this brute-forced the same mechanism through 4 seeds ×
    // 2,500 gens of a SPLITTING tree, where every split divides a leaf's
    // speakers and keeps it below the floor. Disabling tree splits tests
    // the identical tier logic ~100× faster.
    const config = defaultConfig();
    const sim = createSimulation({
      ...config,
      seed: "tier-advance",
      modes: { ...config.modes, tree: false },
    });
    let maxTier = 0;
    for (let i = 0; i < 300; i++) {
      sim.step();
      const state = sim.getState();
      maxTier = leafIds(state.tree)
        .filter((id) => !state.tree[id]!.language.extinct)
        .reduce((m, id) => Math.max(m, state.tree[id]!.language.culturalTier ?? 0), 0);
      if (maxTier >= 1) break;
    }
    if (maxTier === 0) {
      throw new Error("no leaf advanced past tier 0 within 300 non-splitting gens");
    }
  });
});
