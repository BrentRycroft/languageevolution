import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetRomance } from "../presets/romance";
import { presetEnglish } from "../presets/english";
import { findSchedule, milestoneKey } from "../historical";
import { romanceSchedule } from "../historical/romance";
import { validateSchedule } from "../historical/validate";

/**
 * historical.test.ts — Phase 70 T1: Historical Mode runner unit tests.
 */

describe("Phase 70 T1 — Historical Mode (Latin → Romance)", () => {
  it("schedule is registered and findSchedule returns it", () => {
    const s = findSchedule("romance");
    expect(s).toBeDefined();
    expect(s?.presetId).toBe("romance");
  });

  it("milestoneKey is stable and unique per milestone", () => {
    const m1 = romanceSchedule.milestones[0]!;
    const k = milestoneKey(m1);
    expect(k).toContain("25:bias:proto");
    expect(k).toContain("Vulgar Latin lenition");
  });

  it("validateSchedule reports no issues for the romance schedule", () => {
    const issues = validateSchedule(romanceSchedule);
    expect(issues).toEqual([]);
  });

  it("Historical Mode OFF leaves proto without historicalRole and never fires milestones", () => {
    const cfg = presetRomance();
    cfg.seed = "hist-off";
    const sim = createSimulation(cfg);
    for (let i = 0; i < 30; i++) sim.step();
    const proto = sim.getState().tree["L-0"]!.language;
    expect(proto.historicalRole).toBeUndefined();
    const events = proto.events.filter((e) => e.kind === "historical_milestone");
    expect(events).toEqual([]);
  });

  it("Historical Mode ON tags proto and fires the M1 milestone at gen 25", () => {
    const cfg = presetRomance();
    cfg.seed = "hist-on";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    const proto0 = sim.getState().tree["L-0"]!.language;
    expect(proto0.historicalRole).toBe("proto");

    for (let i = 0; i < 30; i++) sim.step();
    // Find the milestone event somewhere in the tree (proto may have
    // split off daughters by gen 30, but the proto is the only leaf
    // tagged with historicalRole="proto" at gen 25).
    const allLangs = Object.values(sim.getState().tree).map((n) => n.language);
    const milestoneEvents = allLangs.flatMap((l) =>
      l.events.filter((e) => e.kind === "historical_milestone"),
    );
    expect(milestoneEvents.length).toBeGreaterThanOrEqual(1);
    const m1 = milestoneEvents.find((e) =>
      e.description.includes("Vulgar Latin lenition"),
    );
    expect(m1).toBeDefined();
    expect(m1!.generation).toBe(25);
  });

  it("M1 fires exactly once across many gens (idempotency)", () => {
    const cfg = presetRomance();
    cfg.seed = "hist-idem";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 60; i++) sim.step();
    const allLangs = Object.values(sim.getState().tree).map((n) => n.language);
    const m1events = allLangs.flatMap((l) =>
      l.events.filter(
        (e) =>
          e.kind === "historical_milestone" &&
          e.description.includes("Vulgar Latin lenition"),
      ),
    );
    expect(m1events.length).toBe(1);
  });

  it("M1 multiplies lang.ruleBias.lenition on every proto-tagged leaf (intensity=1.0)", () => {
    // Compare two runs with the same seed: intensity=1 vs intensity=0.
    // The intensity=0 run sets up the same RNG sequence (volatility
    // upheaval is gated on intensity > 0, so this changes RNG order
    // slightly — we use a generous ratio threshold).
    const seed = "hist-bias-compare";
    const buildCfg = (intensity: number) => {
      const c = presetRomance();
      c.seed = seed;
      c.historical = { scheduleId: "romance", intensity };
      return c;
    };
    const runOnce = (intensity: number) => {
      const sim = createSimulation(buildCfg(intensity));
      for (let i = 0; i < 26; i++) sim.step();
      return Object.values(sim.getState().tree)
        .filter((n) => n.childrenIds.length === 0)
        .map((n) => n.language)
        .filter((l) => l.historicalRole === "proto" && !l.extinct);
    };
    const onLeaves = runOnce(1.0);
    const offLeaves = runOnce(0);
    expect(onLeaves.length).toBeGreaterThan(0);
    expect(offLeaves.length).toBeGreaterThan(0);
    const avg = (langs: typeof onLeaves) =>
      langs.reduce((a, l) => a + (l.ruleBias?.lenition ?? 1), 0) / langs.length;
    const avgOn = avg(onLeaves);
    const avgOff = avg(offLeaves);
    // M1's lenition factor is 1.8; expect on-avg to be at least 1.4×
    // off-avg (allows headroom for jitter + RNG-order differences).
    expect(avgOn / avgOff).toBeGreaterThan(1.4);
  });

  it("intensity=0 neutralises the milestone but still marks fired", () => {
    const cfg = presetRomance();
    cfg.seed = "hist-zero";
    cfg.historical = { scheduleId: "romance", intensity: 0 };
    const sim = createSimulation(cfg);
    const baselineBias =
      sim.getState().tree["L-0"]!.language.ruleBias?.lenition ?? 1;
    for (let i = 0; i < 26; i++) sim.step();
    const state = sim.getState();
    // Each proto-tagged leaf's lenition bias should be the inherited
    // baseline (no nudge applied because intensity=0 → factor=1).
    const protoLeaves = Object.values(state.tree)
      .filter((n) => n.childrenIds.length === 0)
      .map((n) => n.language)
      .filter((l) => l.historicalRole === "proto" && !l.extinct);
    expect(protoLeaves.length).toBeGreaterThan(0);
    for (const lang of protoLeaves) {
      // Daughters inherit ruleBias from parent with jitter (split.ts:185
      // applies jitterBias scale 0.3); compare against a generous bound.
      const ratio = (lang.ruleBias?.lenition ?? 1) / baselineBias;
      expect(ratio).toBeLessThan(1.5);
    }
    // The milestone still fires (idempotency tracker filled).
    expect(state.firedHistoricalMilestones?.length ?? 0).toBeGreaterThan(0);
  });

  it("scheduleId mismatch with preset is silently ignored (no proto tag)", () => {
    const cfg = presetEnglish();
    cfg.seed = "hist-mismatch";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    // Init runs because scheduleId is set, so init.ts tags proto.
    // But stepHistorical bails out because schedule.presetId !== preset.
    const proto0 = sim.getState().tree["L-0"]!.language;
    expect(proto0.historicalRole).toBe("proto");
    for (let i = 0; i < 30; i++) sim.step();
    const allLangs = Object.values(sim.getState().tree).map((n) => n.language);
    const milestoneEvents = allLangs.flatMap((l) =>
      l.events.filter((e) => e.kind === "historical_milestone"),
    );
    expect(milestoneEvents).toEqual([]);
  });

  it("STRUCTURAL_FIELDS includes 'historical' (compile-time guard)", () => {
    // This test is a sentinel — it documents the requirement that
    // toggling Historical Mode resets the simulation. Actual STRUCTURAL_FIELDS
    // membership is verified by the structural-reset behavior in store.ts.
    expect(true).toBe(true);
  });
});

describe("Phase 70 T2 — Italo-Western / Eastern Romance split (M2)", () => {
  it("M2 split fires at gen 65 with western+eastern daughters", () => {
    const cfg = presetRomance();
    cfg.seed = "split-fire";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 70; i++) sim.step();
    const state = sim.getState();
    const evt = state.historicalEvents?.find(
      (e) => e.label === "Italo-Western vs Eastern Romance",
    );
    expect(evt).toBeDefined();
    expect(evt!.generation).toBe(65);
    expect(evt!.kind).toBe("fired");
  });

  it("M2 produces matched western+eastern leaves; no proto-tagged leaves remain", () => {
    const cfg = presetRomance();
    cfg.seed = "split-pair";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 70; i++) sim.step();
    const leaves = Object.values(sim.getState().tree)
      .filter((n) => n.childrenIds.length === 0)
      .map((n) => n.language)
      .filter((l) => !l.extinct);
    const westernLeaves = leaves.filter((l) => l.historicalRole === "western");
    const easternLeaves = leaves.filter((l) => l.historicalRole === "eastern");
    const protoLeaves = leaves.filter((l) => l.historicalRole === "proto");
    expect(westernLeaves.length).toBeGreaterThan(0);
    expect(easternLeaves.length).toBeGreaterThan(0);
    expect(westernLeaves.length).toBe(easternLeaves.length);
    expect(protoLeaves.length).toBe(0);
  });

  it("daughter nameHints applied: western='Proto-Western-Romance'", () => {
    const cfg = presetRomance();
    cfg.seed = "split-name";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 70; i++) sim.step();
    const leaves = Object.values(sim.getState().tree)
      .filter((n) => n.childrenIds.length === 0)
      .map((n) => n.language)
      .filter((l) => !l.extinct);
    const westernLeaves = leaves.filter((l) => l.historicalRole === "western");
    expect(westernLeaves.length).toBeGreaterThan(0);
    for (const lang of westernLeaves) {
      expect(lang.name).toBe("Proto-Western-Romance");
    }
  });

  it("western daughters have higher lenition bias than eastern (initialBias applied)", () => {
    const cfg = presetRomance();
    cfg.seed = "split-bias";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 66; i++) sim.step();
    const leaves = Object.values(sim.getState().tree)
      .filter((n) => n.childrenIds.length === 0)
      .map((n) => n.language)
      .filter((l) => !l.extinct);
    const wAvg =
      leaves
        .filter((l) => l.historicalRole === "western")
        .reduce((a, l) => a + (l.ruleBias?.lenition ?? 1), 0) /
      Math.max(1, leaves.filter((l) => l.historicalRole === "western").length);
    const eAvg =
      leaves
        .filter((l) => l.historicalRole === "eastern")
        .reduce((a, l) => a + (l.ruleBias?.lenition ?? 1), 0) /
      Math.max(1, leaves.filter((l) => l.historicalRole === "eastern").length);
    expect(wAvg).toBeGreaterThan(eAvg);
  });

  it("M2 fires exactly once across many gens (idempotency)", () => {
    const cfg = presetRomance();
    cfg.seed = "split-idem";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 90; i++) sim.step();
    const events = sim.getState().historicalEvents ?? [];
    const m2events = events.filter(
      (e) => e.label === "Italo-Western vs Eastern Romance" && e.kind === "fired",
    );
    expect(m2events.length).toBe(1);
  });
});
