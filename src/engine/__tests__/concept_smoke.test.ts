import { describe, it } from "vitest";
import { createSimulation } from "../simulation";
import { PRESETS } from "../presets";
import { leafIds } from "../tree/split";
import { defaultConfig } from "../config";

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
    lexSize: Object.keys(lang.lexicon).length,
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
  it.each(PRESETS.map((p) => p.id))("preset %s runs 800 gens cleanly", (presetId) => {
    const result = runPreset(presetId, 800);
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

  it("default preset shows tier advancement over a long run", () => {
    const SEEDS = ["tier-stress-a", "tier-stress-b", "tier-stress-c", "tier-stress-d"];
    let bestTier = 0;
    let bestSpeakers = 0;
    for (const seed of SEEDS) {
      const config = defaultConfig();
      const sim = createSimulation({ ...config, seed });
      for (let i = 0; i < 2500; i++) sim.step();
      const state = sim.getState();
      const alive = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
      const tiers = alive.map((id) => state.tree[id]!.language.culturalTier ?? 0);
      const speakers = alive.map((id) => state.tree[id]!.language.speakers ?? 0);
      const maxTier = tiers.length > 0 ? Math.max(...tiers) : 0;
      const maxSpeakers = speakers.length > 0 ? Math.max(...speakers) : 0;
      if (maxTier > bestTier) bestTier = maxTier;
      if (maxSpeakers > bestSpeakers) bestSpeakers = maxSpeakers;
      if (bestTier >= 1) break;
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n=== tier-stress test === highest tier: ${bestTier}, max speakers: ${bestSpeakers}`,
    );
    if (bestTier === 0) {
      throw new Error(
        `tier-stress test: no leaf advanced past tier 0 across ${SEEDS.length} seeds (max speakers: ${bestSpeakers})`,
      );
    }
  });
});
