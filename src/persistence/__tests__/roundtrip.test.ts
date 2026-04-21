import { describe, it, expect, beforeEach } from "vitest";
import { saveRun, loadRun, listRuns, deleteRun } from "../storage";
import { defaultConfig } from "../../engine/config";
import { createSimulation } from "../../engine/simulation";
import { leafIds } from "../../engine/tree/split";

function stringifyLexicons(state: ReturnType<ReturnType<typeof createSimulation>["getState"]>) {
  return Object.keys(state.tree)
    .filter((id) => state.tree[id]!.childrenIds.length === 0)
    .sort()
    .map((id) => {
      const lex = state.tree[id]!.language.lexicon;
      return Object.keys(lex)
        .sort()
        .map((m) => `${m}=${lex[m]!.join("")}`)
        .join(",");
    })
    .join("|");
}

describe("persistence round-trip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("save + load + replay produces identical lexicons", () => {
    const cfg = defaultConfig();
    const simA = createSimulation(cfg);
    for (let i = 0; i < 80; i++) simA.step();
    const beforeSig = stringifyLexicons(simA.getState());

    const saved = saveRun("replay-test", cfg, 80);
    const loaded = loadRun(saved.id);
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    const simB = createSimulation(loaded.config);
    for (let i = 0; i < loaded.generationsRun; i++) simB.step();
    const afterSig = stringifyLexicons(simB.getState());
    expect(afterSig).toBe(beforeSig);
  });

  it("save + listRuns + deleteRun cycle", () => {
    const cfg = defaultConfig();
    const r1 = saveRun("one", cfg, 10);
    const r2 = saveRun("two", cfg, 20);
    const list = listRuns();
    expect(list.length).toBe(2);
    expect(list.map((r) => r.id)).toContain(r1.id);
    expect(list.map((r) => r.id)).toContain(r2.id);
    deleteRun(r1.id);
    expect(listRuns().length).toBe(1);
  });

  it("leafIds is deterministic after replay", () => {
    const cfg = { ...defaultConfig(), seed: "deterministic" };
    const simA = createSimulation(cfg);
    for (let i = 0; i < 60; i++) simA.step();
    const a = leafIds(simA.getState().tree).join(",");
    const simB = createSimulation(cfg);
    for (let i = 0; i < 60; i++) simB.step();
    const b = leafIds(simB.getState().tree).join(",");
    expect(a).toBe(b);
  });
});
