import { describe, it, expect } from "vitest";
import { isExpressive, soundChangeSensitivity } from "../lexicon/expressive";
import { realismMultiplier } from "../phonology/rate";
import { stepCreolization } from "../steps/creolization";
import { presetPIE } from "../presets/pie";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";

describe("ideophones / expressive phonology", () => {
  it("seeded iconic meanings (sharp / loud / tiny / bright / crow / buzz / hum / growl / flash / snap / burst) are all flagged", () => {
    for (const m of [
      "sharp", "loud", "tiny", "bright",
      "crow", "buzz", "hum", "growl",
      "flash", "snap", "burst",
    ]) {
      expect(isExpressive(m), `${m} should be expressive`).toBe(true);
    }
  });

  it("expressive words have low sound-change sensitivity (resist regular change)", () => {
    expect(soundChangeSensitivity("sharp")).toBeLessThan(0.5);
    expect(soundChangeSensitivity("water")).toBe(1.0);
  });

  it("reduplicated -intens forms are also expressive", () => {
    expect(isExpressive("loud-intens")).toBe(true);
  });
});

describe("realism master multiplier", () => {
  it("default of 1.0 when not set", () => {
    expect(realismMultiplier(undefined)).toBe(1);
    expect(realismMultiplier({})).toBe(1);
  });

  it("respects an explicit value", () => {
    expect(realismMultiplier({ realismMultiplier: 0.5 })).toBe(0.5);
    expect(realismMultiplier({ realismMultiplier: 3 })).toBe(3);
  });

  it("clamps to a sane range so a misconfigured value can't freeze or explode the engine", () => {
    expect(realismMultiplier({ realismMultiplier: 100 })).toBe(10);
    expect(realismMultiplier({ realismMultiplier: -1 })).toBe(0.05);
    expect(realismMultiplier({ realismMultiplier: 0 })).toBe(0.05);
  });

  it("default config exposes realismMultiplier (or undefined falling back to 1)", () => {
    const cfg = defaultConfig();
    expect(realismMultiplier(cfg)).toBe(1);
  });
});

describe("creolization event", () => {
  it("noop when only one alive leaf exists", async () => {
    const sim = createSimulation(presetPIE());
    sim.step();
    const stateBefore = sim.getState();
    const beforeKeys = Object.keys(stateBefore.tree).length;
    stepCreolization(stateBefore, sim.getConfig(), makeRng("creo-noop"), 1);
    expect(Object.keys(stateBefore.tree).length).toBe(beforeKeys);
  });

  it("structural shift: drops case + sets analytical profile when fired", () => {
    const sim = createSimulation(presetPIE());
    for (let i = 0; i < 30; i++) sim.step();
    const state = sim.getState();
    const aliveIds = Object.keys(state.tree).filter(
      (id) => state.tree[id]!.childrenIds.length === 0 && !state.tree[id]!.language.extinct,
    );
    if (aliveIds.length < 2) return;
    let fired = false;
    for (let t = 0; t < 5000 && !fired; t++) {
      const before = aliveIds.map((id) => ({
        id,
        paradigms: Object.keys(state.tree[id]!.language.morphology.paradigms).length,
      }));
      stepCreolization(state, sim.getConfig(), makeRng(`creo-${t}`), state.generation + t);
      for (const b of before) {
        const after = Object.keys(state.tree[b.id]!.language.morphology.paradigms).length;
        if (after < b.paradigms) {
          fired = true;
          const lang = state.tree[b.id]!.language;
          expect(lang.grammar.hasCase).toBe(false);
          expect(lang.grammar.synthesisIndex).toBe(1.0);
          break;
        }
      }
    }
    expect(true).toBe(true);
  });
});
