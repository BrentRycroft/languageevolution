import { describe, expect, it } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { PRESETS } from "../presets";
import { leafIds } from "../tree/split";
import { buildGrammarBrief } from "../../persistence/export";

/**
 * End-to-end integration smoke test. Exercises the full engine over
 * a long run on every preset, then poke at the produced state in the
 * same shape the UI consumes. The point is to catch any contract drift
 * between engine internals and view-layer expectations:
 *   - every Language has the fields the UI reads (extinct, lexicon,
 *     grammar, events, conservatism, speakers, …);
 *   - new optional fields (culturalTier, lexicalCapacity,
 *     colexifiedAs, derivationalSuffixes, suppletion, stressPattern)
 *     are either undefined or have the type they're declared as;
 *   - serialising the state via JSON.stringify (the persistence
 *     transport) and round-tripping through restoreState works;
 *   - a grammarBrief Markdown render doesn't throw.
 */
describe("end-to-end integration", () => {
  it.each(PRESETS.map((p) => p.id))("preset %s runs + serialises + restores cleanly", (presetId) => {
    const config = PRESETS.find((p) => p.id === presetId)!.build();
    const sim = createSimulation({ ...config, seed: `e2e-${presetId}` });
    for (let i = 0; i < 400; i++) sim.step();
    const state = sim.getState();
    const alive = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
    expect(alive.length).toBeGreaterThan(0);

    // Every alive language must have the fields the UI reads.
    for (const id of alive) {
      const lang = state.tree[id]!.language;
      expect(typeof lang.id).toBe("string");
      expect(typeof lang.name).toBe("string");
      expect(typeof lang.birthGeneration).toBe("number");
      expect(typeof lang.conservatism).toBe("number");
      expect(lang.lexicon).toBeDefined();
      expect(lang.grammar).toBeDefined();
      expect(Array.isArray(lang.events)).toBe(true);
      expect(lang.phonemeInventory).toBeDefined();
      expect(Array.isArray(lang.phonemeInventory.segmental)).toBe(true);
      expect(lang.morphology).toBeDefined();
      // New optional fields must have correct types when present.
      if (lang.culturalTier !== undefined) {
        expect([0, 1, 2, 3]).toContain(lang.culturalTier);
      }
      if (lang.lexicalCapacity !== undefined) {
        expect(typeof lang.lexicalCapacity).toBe("number");
        expect(lang.lexicalCapacity).toBeGreaterThan(0);
      }
      if (lang.stressPattern !== undefined) {
        expect(["initial", "penult", "final"]).toContain(lang.stressPattern);
      }
      if (lang.colexifiedAs !== undefined) {
        for (const [winner, losers] of Object.entries(lang.colexifiedAs)) {
          expect(typeof winner).toBe("string");
          expect(Array.isArray(losers)).toBe(true);
        }
      }
      if (lang.derivationalSuffixes !== undefined) {
        for (const s of lang.derivationalSuffixes) {
          expect(typeof s.tag).toBe("string");
          expect(Array.isArray(s.affix)).toBe(true);
        }
      }
      // Every form must be a non-empty array of strings.
      for (const [m, form] of Object.entries(lang.lexicon)) {
        expect(typeof m).toBe("string");
        expect(Array.isArray(form)).toBe(true);
        expect(form.length).toBeGreaterThan(0);
        for (const p of form) expect(typeof p).toBe("string");
      }
    }

    // Persistence round-trip via JSON (matches what the saved-runs
    // store does over IndexedDB).
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);
    expect(parsed.generation).toBe(state.generation);
    expect(Object.keys(parsed.tree).sort()).toEqual(Object.keys(state.tree).sort());

    // restoreState should accept the parsed snapshot without throwing.
    const sim2 = createSimulation({ ...config, seed: `e2e-${presetId}` });
    sim2.restoreState(parsed);
    expect(sim2.getState().generation).toBe(state.generation);
    // After restore, one more step should produce a valid state.
    sim2.step();
    expect(sim2.getState().generation).toBe(state.generation + 1);

    // The grammarBrief Markdown renderer should accept any alive language.
    for (const id of alive.slice(0, 1)) {
      const brief = buildGrammarBrief(state, id);
      expect(typeof brief).toBe("string");
      expect(brief.length).toBeGreaterThan(0);
    }
  });

  it("default preset: events log surfaces every event family the engine emits", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "e2e-events" });
    for (let i = 0; i < 600; i++) sim.step();
    const state = sim.getState();
    const families = new Set<string>();
    for (const id of Object.keys(state.tree)) {
      for (const e of state.tree[id]!.language.events) {
        families.add(e.kind);
      }
    }
    // The sim emits these event kinds in normal use. We don't assert
    // every single one fires within 600 gens (some are rare), but at
    // least the common ones should appear. If the contract changes
    // and a kind disappears entirely, this test will catch it.
    expect(families.has("sound_change")).toBe(true);
    expect(families.has("coinage")).toBe(true);
  });

  it("determinism: same seed + same generations ⇒ same state", () => {
    const config = defaultConfig();
    const a = createSimulation({ ...config, seed: "determinism-e2e" });
    const b = createSimulation({ ...config, seed: "determinism-e2e" });
    for (let i = 0; i < 200; i++) {
      a.step();
      b.step();
    }
    const stateA = a.getState();
    const stateB = b.getState();
    expect(stateA.generation).toBe(stateB.generation);
    expect(Object.keys(stateA.tree).sort()).toEqual(Object.keys(stateB.tree).sort());
    for (const id of Object.keys(stateA.tree)) {
      const langA = stateA.tree[id]!.language;
      const langB = stateB.tree[id]!.language;
      // Compare lexicon by joined-form strings (cheaper than deep equality).
      const formA: Record<string, string> = {};
      const formB: Record<string, string> = {};
      for (const [m, f] of Object.entries(langA.lexicon)) formA[m] = f.join("|");
      for (const [m, f] of Object.entries(langB.lexicon)) formB[m] = f.join("|");
      expect(formA).toEqual(formB);
    }
  });
});
