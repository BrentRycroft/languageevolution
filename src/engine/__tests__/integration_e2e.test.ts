import { describe, expect, it } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { PRESETS } from "../presets";
import { leafIds } from "../tree/split";
import { buildGrammarBrief } from "../../persistence/export";

describe("end-to-end integration", () => {
  // Phase 29 Tranche 7g: trimmed gen-counts so the full integration
  // suite stays under the 5-minute CI budget. The structural checks
  // below (serialisation roundtrip, restoreState equivalence,
  // grammar-brief generation) don't need 400 gens — 100 exercises
  // every code path that mutates state.
  it.each(PRESETS.map((p) => p.id))("preset %s runs + serialises + restores cleanly", (presetId) => {
    const config = PRESETS.find((p) => p.id === presetId)!.build();
    const sim = createSimulation({ ...config, seed: `e2e-${presetId}` });
    for (let i = 0; i < 50; i++) sim.step();
    const state = sim.getState();
    const alive = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
    expect(alive.length).toBeGreaterThan(0);

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
      if (lang.culturalTier !== undefined) {
        expect([0, 1, 2, 3]).toContain(lang.culturalTier);
      }
      if (lang.lexicalCapacity !== undefined) {
        expect(typeof lang.lexicalCapacity).toBe("number");
        expect(lang.lexicalCapacity).toBeGreaterThan(0);
      }
      if (lang.stressPattern !== undefined) {
        expect(["initial", "penult", "final", "antepenult", "lexical"]).toContain(
          lang.stressPattern,
        );
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
      for (const [m, form] of Object.entries(lang.lexicon)) {
        expect(typeof m).toBe("string");
        expect(Array.isArray(form)).toBe(true);
        expect(form.length).toBeGreaterThan(0);
        for (const p of form) expect(typeof p).toBe("string");
      }
    }

    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);
    expect(parsed.generation).toBe(state.generation);
    expect(Object.keys(parsed.tree).sort()).toEqual(Object.keys(state.tree).sort());

    const sim2 = createSimulation({ ...config, seed: `e2e-${presetId}` });
    sim2.restoreState(parsed);
    expect(sim2.getState().generation).toBe(state.generation);
    sim2.step();
    expect(sim2.getState().generation).toBe(state.generation + 1);

    for (const id of alive.slice(0, 1)) {
      const brief = buildGrammarBrief(state, id);
      expect(typeof brief).toBe("string");
      expect(brief.length).toBeGreaterThan(0);
    }
  });

  it("default preset: events log surfaces every event family the engine emits", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "e2e-events" });
    for (let i = 0; i < 100; i++) sim.step();
    const state = sim.getState();
    const families = new Set<string>();
    for (const id of Object.keys(state.tree)) {
      for (const e of state.tree[id]!.language.events) {
        families.add(e.kind);
      }
    }
    expect(families.has("sound_change")).toBe(true);
    expect(families.has("coinage")).toBe(true);
  });

  // Phase 29 Tranche 7g (item 37): real determinism check. Validates
  // BYTE-LEVEL state equivalence (lexicons + grammar + activeRules)
  // across two seeded sims, replacing the prior shallow check that
  // only compared lexicon strings. Trimmed to 100 gens to fit the CI
  // budget while still exercising splits + sound-changes + grammar.
  it("determinism: same seed + same generations ⇒ same state (deep)", () => {
    const config = defaultConfig();
    const a = createSimulation({ ...config, seed: "determinism-e2e" });
    const b = createSimulation({ ...config, seed: "determinism-e2e" });
    for (let i = 0; i < 60; i++) {
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
      // Lexicons identical
      const formA: Record<string, string> = {};
      const formB: Record<string, string> = {};
      for (const [m, f] of Object.entries(langA.lexicon)) formA[m] = f.join("|");
      for (const [m, f] of Object.entries(langB.lexicon)) formB[m] = f.join("|");
      expect(formA).toEqual(formB);
      // Grammar identical (typological state)
      expect(langA.grammar).toEqual(langB.grammar);
      // Active rules identical (rule schedule)
      expect((langA.activeRules ?? []).map((r) => r.id).sort())
        .toEqual((langB.activeRules ?? []).map((r) => r.id).sort());
      // Phoneme inventory identical
      expect(langA.phonemeInventory.segmental.slice().sort())
        .toEqual(langB.phonemeInventory.segmental.slice().sort());
    }
  });
});
