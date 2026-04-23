import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { presetPIE } from "../presets/pie";
import { presetGermanic } from "../presets/germanic";
import { presetRomance } from "../presets/romance";
import { presetBantu } from "../presets/bantu";
import { presetTokipona } from "../presets/tokipona";
import { leafIds } from "../tree/split";

/**
 * 2000-generation smoke test across every preset. Acts as a scripted
 * "use the app" harness: drives the engine with default config for 2000
 * steps per preset, collects metrics, and asserts invariants that would
 * otherwise only surface in a long interactive session.
 *
 * This test is intentionally slow (~60-120 s). Gated behind the
 * SMOKE_2K env var so `npm test` stays fast; run with
 *   SMOKE_2K=1 npm test -- --run src/engine/__tests__/smoke_2k
 * when you want the belt-and-braces long-run check.
 */

// Gate via env var without pulling in @types/node. Vitest exposes process
// at runtime, but we reach it through globalThis so TypeScript is happy.
const SMOKE_ENABLED = !!(
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.SMOKE_2K
);
const describeSmoke = SMOKE_ENABLED ? describe : describe.skip;

interface SmokeMetrics {
  name: string;
  aliveLeaves: number;
  totalLeaves: number;
  totalForms: number;
  activeRulesTotal: number;
  retiredRulesTotal: number;
  coinageEvents: number;
  driftEvents: number;
  ruleEvents: number;
  takeoverEvents: number;
  emptyFormCount: number;
  danglingRegisters: number;
  danglingOrigins: number;
  maxFormLength: number;
  avgFormLength: number;
  elapsedMs: number;
}

function runAndCollect(
  name: string,
  build: () => ReturnType<typeof defaultConfig>,
  gens: number,
): SmokeMetrics {
  const t0 = Date.now();
  const sim = createSimulation(build());
  for (let i = 0; i < gens; i++) sim.step();
  const elapsedMs = Date.now() - t0;
  const state = sim.getState();
  const leaves = leafIds(state.tree);
  const alive = leaves.filter((id) => !state.tree[id]!.language.extinct);

  let totalForms = 0;
  let activeRulesTotal = 0;
  let retiredRulesTotal = 0;
  let coinageEvents = 0;
  let driftEvents = 0;
  let ruleEvents = 0;
  let takeoverEvents = 0;
  let emptyFormCount = 0;
  let danglingRegisters = 0;
  let danglingOrigins = 0;
  let maxFormLength = 0;
  let totalLen = 0;

  for (const id of Object.keys(state.tree)) {
    const lang = state.tree[id]!.language;
    activeRulesTotal += (lang.activeRules ?? []).length;
    retiredRulesTotal += (lang.retiredRules ?? []).length;

    for (const [m, form] of Object.entries(lang.lexicon)) {
      totalForms++;
      totalLen += form.length;
      if (form.length > maxFormLength) maxFormLength = form.length;
      if (form.length === 0) emptyFormCount++;
      void m;
    }

    // Orphan registerOf / wordOrigin (keys referencing meanings that no
    // longer live in the lexicon).
    if (lang.registerOf) {
      for (const key of Object.keys(lang.registerOf)) {
        if (!lang.lexicon[key]) danglingRegisters++;
      }
    }
    for (const key of Object.keys(lang.wordOrigin)) {
      if (!lang.lexicon[key]) danglingOrigins++;
    }

    for (const e of lang.events) {
      if (e.kind === "coinage") coinageEvents++;
      else if (e.kind === "semantic_drift") driftEvents++;
      else if (e.kind === "sound_change") ruleEvents++;
      if (e.description.includes("takeover")) takeoverEvents++;
    }
  }

  return {
    name,
    aliveLeaves: alive.length,
    totalLeaves: leaves.length,
    totalForms,
    activeRulesTotal,
    retiredRulesTotal,
    coinageEvents,
    driftEvents,
    ruleEvents,
    takeoverEvents,
    emptyFormCount,
    danglingRegisters,
    danglingOrigins,
    maxFormLength,
    avgFormLength: totalForms > 0 ? totalLen / totalForms : 0,
    elapsedMs,
  };
}

function reportMetrics(m: SmokeMetrics): void {
  // Print a table row for each preset via console.log — visible when the
  // test suite runs with --reporter verbose.
  const row = [
    m.name.padEnd(10),
    `alive=${m.aliveLeaves}/${m.totalLeaves}`,
    `forms=${m.totalForms}`,
    `rules=${m.activeRulesTotal}+${m.retiredRulesTotal}ret`,
    `coinage=${m.coinageEvents}`,
    `drift=${m.driftEvents}`,
    `takeovers=${m.takeoverEvents}`,
    `avg-len=${m.avgFormLength.toFixed(1)}`,
    `max-len=${m.maxFormLength}`,
    `empty=${m.emptyFormCount}`,
    `dangling-reg=${m.danglingRegisters}`,
    `dangling-origin=${m.danglingOrigins}`,
    `${m.elapsedMs}ms`,
  ].join("  ");
  // eslint-disable-next-line no-console
  console.log(`[smoke-2k] ${row}`);
}

const GENS = 2000;

describeSmoke("2000-generation smoke test (SMOKE_2K=1 to run)", () => {
  it.concurrent.each([
    ["default", () => defaultConfig()],
    ["pie", presetPIE],
    ["germanic", presetGermanic],
    ["romance", presetRomance],
    ["bantu", presetBantu],
    ["tokipona", presetTokipona],
  ] as const)(
    "preset %s: %o",
    (name, build) => {
      const m = runAndCollect(name, build, GENS);
      reportMetrics(m);

      // Invariants that hold regardless of preset / seed.
      expect(m.emptyFormCount, `${name}: empty forms`).toBe(0);
      expect(m.danglingRegisters, `${name}: dangling registerOf`).toBe(0);
      expect(m.danglingOrigins, `${name}: dangling wordOrigin`).toBe(0);
      // A run of 2000 gens should hold at least one living leaf.
      expect(m.aliveLeaves, `${name}: no extinction wipeout`).toBeGreaterThan(0);
      // Should produce a healthy amount of procedural activity.
      expect(m.ruleEvents, `${name}: sound-change events`).toBeGreaterThan(0);
      // Coinages fire whenever the need vector pulls — expect some
      // except on toki pona which starts nearly full.
      if (name !== "tokipona") {
        expect(m.coinageEvents, `${name}: coinage events`).toBeGreaterThan(0);
      }
    },
    120_000,
  );

  it("determinism: same seed twice ⇒ identical metrics", () => {
    const a = runAndCollect("pie-a", presetPIE, 200);
    const b = runAndCollect("pie-b", presetPIE, 200);
    expect(a.aliveLeaves).toBe(b.aliveLeaves);
    expect(a.totalForms).toBe(b.totalForms);
    expect(a.activeRulesTotal).toBe(b.activeRulesTotal);
    expect(a.retiredRulesTotal).toBe(b.retiredRulesTotal);
    expect(a.coinageEvents).toBe(b.coinageEvents);
    expect(a.driftEvents).toBe(b.driftEvents);
    expect(a.ruleEvents).toBe(b.ruleEvents);
  });
});
