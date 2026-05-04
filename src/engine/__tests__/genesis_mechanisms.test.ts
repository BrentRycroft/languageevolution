import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { MECHANISMS } from "../genesis/mechanisms";
import { makeRng } from "../rng";
import { leafIds } from "../tree/split";

describe("genesis mechanisms", () => {
  it("catalog registers all expected mechanism ids", () => {
    const ids = new Set(MECHANISMS.map((m) => m.id));
    expect(ids.has("mechanism.compound")).toBe(true);
    expect(ids.has("mechanism.derivation")).toBe(true);
    expect(ids.has("mechanism.calque")).toBe(true);
    expect(ids.has("mechanism.clipping")).toBe(true);
    expect(ids.has("mechanism.blending")).toBe(true);
    expect(ids.has("mechanism.ideophone")).toBe(true);
    expect(ids.has("mechanism.conversion")).toBe(true);
  });

  it("compound produces a form that combines two lexicon words", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    const compound = MECHANISMS.find((m) => m.id === "mechanism.compound")!;
    let hit: { form: import("../types").WordForm } | null = null;
    for (let i = 0; i < 16; i++) {
      hit = compound.tryCoin(lang, "sky-fire", state.tree, makeRng("c" + i));
      if (hit) break;
    }
    expect(hit).not.toBeNull();
    if (!hit) return;
    expect(hit.form.length).toBeGreaterThanOrEqual(2);
  });

  it("calque refuses when no sister has the target", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    const rng = makeRng("calque-none");
    const calque = MECHANISMS.find((m) => m.id === "mechanism.calque")!;
    expect(calque.tryCoin(lang, "water-bird", state.tree, rng)).toBeNull();
  });

  it("clipping shortens a long form", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    lang.lexicon["laboratory"] = ["l", "a", "b", "o", "r", "a", "t", "o", "r", "i"];
    const rng = makeRng("clip");
    const clip = MECHANISMS.find((m) => m.id === "mechanism.clipping")!;
    const result = clip.tryCoin(lang, "lab", state.tree, rng);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.form.length).toBeLessThan(6);
  });

  it("ideophone produces a short form using only inventory phonemes", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    const rng = makeRng("ideo");
    const ideo = MECHANISMS.find((m) => m.id === "mechanism.ideophone")!;
    const result = ideo.tryCoin(lang, "bang", state.tree, rng);
    expect(result).not.toBeNull();
    if (!result) return;
    const inventory = new Set(lang.phonemeInventory.segmental);
    for (const p of result.form) {
      expect(inventory.has(p), `phoneme ${p} in inventory`).toBe(true);
    }
  });

  it("conversion reuses an existing form unchanged", () => {
    const sim = createSimulation(defaultConfig());
    const state = sim.getState();
    const lang = state.tree[state.rootId]!.language;
    const rng = makeRng("conv");
    const conv = MECHANISMS.find((m) => m.id === "mechanism.conversion")!;
    const result = conv.tryCoin(lang, "kitten", state.tree, rng);
    if (result) {
      const allForms = Object.values(lang.lexicon).map((f) => f.join(""));
      expect(allForms).toContain(result.form.join(""));
    }
  });

  // Phase 29 Tranche 7g: trimmed 200→80 gens to keep CI under 5 min.
  // 80 gens still triggers ≥ 2 origin tags reliably (compounding,
  // borrowing, reduplication, etc.) which is all the assertion needs.
  it("80-gen run produces a variety of origin tags", () => {
    const sim = createSimulation({
      ...defaultConfig(),
      seed: "diversity",
      tree: { ...defaultConfig().tree, splitProbabilityPerGeneration: 0.1 },
    });
    for (let i = 0; i < 80; i++) sim.step();
    const state = sim.getState();
    const tags = new Set<string>();
    for (const id of leafIds(state.tree)) {
      for (const e of state.tree[id]!.language.events) {
        if (e.kind !== "coinage") continue;
        const tag = e.description.split(":")[0]!;
        tags.add(tag);
      }
    }
    expect(tags.size).toBeGreaterThanOrEqual(2);
  });
});
