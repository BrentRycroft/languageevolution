import { describe, it, expect } from "vitest";
import { formViewOf } from "../lexicon/store";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { MECHANISMS } from "../genesis/mechanisms";
import { makeRng } from "../rng";
import { leafIds } from "../tree/split";
import { lexSet } from "../lexicon/access";

/**
 * genesis_mechanisms.test.ts
 *
 * Test suite for: "genesis mechanisms".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

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
    // The compound mechanism builds from two SEMANTICALLY-RELATED lexemes
    // (the random-mash fallback was removed — see compound.ts), so the target
    // must belong to a populated semantic cluster. "fire" is in the rich
    // `environment` cluster (water/stone/tree/sun/…), giving ≥2 in-lexicon parts.
    let hit: { form: import("../types").WordForm } | null = null;
    for (let i = 0; i < 16; i++) {
      hit = compound.tryCoin(lang, "fire", state.tree, makeRng("c" + i));
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
    // Phase 2b (evolution-realism): clipping now clips a longer word that is
    // SEMANTICALLY RELATED to the target, not a random long lexeme. Give the
    // body-cluster concept "head" a long form and clip it for the related
    // target "eye" (both in the `body` cluster, so relatedMeanings links
    // them). The old setup clipped an injected "laboratory" — a non-concept
    // unrelated to anything — which the related-base guard now (correctly)
    // refuses.
    lexSet(lang, "head", ["h", "a", "u", "b", "i", "d", "a"]);
    const rng = makeRng("clip");
    const clip = MECHANISMS.find((m) => m.id === "mechanism.clipping")!;
    const result = clip.tryCoin(lang, "eye", state.tree, rng);
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
      const allForms = Object.values(formViewOf(lang.lexemes)).map((f) => f.join(""));
      expect(allForms).toContain(result.form.join(""));
    }
  });

  // Phase 29 Tranche 7g: trimmed 200→120 gens. 80 wasn't quite
  // enough to reliably trigger ≥ 2 distinct origin tags under the
  // default split rate; 120 is enough and still well within budget.
  it("120-gen run produces a variety of origin tags", () => {
    const sim = createSimulation({
      ...defaultConfig(),
      seed: "diversity",
      tree: { ...defaultConfig().tree, splitProbabilityPerGeneration: 0.1 },
    });
    for (let i = 0; i < 120; i++) sim.step();
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
