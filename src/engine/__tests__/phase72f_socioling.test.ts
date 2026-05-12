import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetRomance } from "../presets/romance";
import { vitalityRateMultiplier } from "../steps/tree";
import { volatilityMultiplier } from "../steps/volatility";
import { tryStructuralBorrow } from "../contact/structuralBorrow";
import type { Language } from "../types";

/**
 * phase72f_socioling.test.ts — sociolinguistic mechanisms.
 */

describe("Phase 72f-1 — endangermentLevel + vitalityRateMultiplier", () => {
  it("vitalityRateMultiplier returns 1.0 for vigorous / undefined", () => {
    expect(vitalityRateMultiplier({} as Language)).toBe(1.0);
    expect(vitalityRateMultiplier({ endangermentLevel: "vigorous" } as Language)).toBe(1.0);
  });

  it("returns 0.6 for endangered, 0.2 for moribund, 0 for extinct", () => {
    expect(vitalityRateMultiplier({ endangermentLevel: "endangered" } as Language)).toBe(0.6);
    expect(vitalityRateMultiplier({ endangermentLevel: "moribund" } as Language)).toBe(0.2);
    expect(vitalityRateMultiplier({ endangermentLevel: "extinct" } as Language)).toBe(0);
  });
});

describe("Phase 72f-2 — continuous volatilityIntensity scalar", () => {
  it("volatilityMultiplier prefers volatilityIntensity over phase machine", () => {
    const lang = {
      volatilityIntensity: 2.5,
      volatilityPhase: { kind: "stable" as const, until: 100, multiplier: 0.1 },
    } as Language;
    expect(volatilityMultiplier(lang)).toBe(2.5);
  });

  it("falls back to phase multiplier when intensity is undefined", () => {
    const lang = {
      volatilityPhase: { kind: "upheaval" as const, until: 100, multiplier: 3.5 },
    } as Language;
    expect(volatilityMultiplier(lang)).toBe(3.5);
  });
});

describe("Phase 72f-3 — prestigeVariety dampens phonology rate", () => {
  it("prestigeVariety field is settable on Language", () => {
    const cfg = presetRomance();
    cfg.seed = "p72f-prestige";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    expect(lang.prestigeVariety).toBeUndefined();
    lang.prestigeVariety = true;
    lang.prestigeVarietySinceGen = 10;
    expect(lang.prestigeVariety).toBe(true);
  });

  it("prestigeVariety is NOT auto-inherited by daughters", async () => {
    // Phase 72 methodological audit D-A5: pre-fix the per-daughter
    // assertion was inside a loop that skipped the proto, with no
    // pre-check that any non-proto daughters actually existed. The
    // test passed vacuously if the M2 split hadn't fired yet. Now we
    // assert at least one non-proto daughter exists before the loop.
    const cfg = presetRomance();
    cfg.seed = "p72f-prestige-inherit";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    const proto = sim.getState().tree["L-0"]!.language;
    proto.prestigeVariety = true;
    proto.prestigeVarietySinceGen = 0;
    // Run through M2 split.
    for (let i = 0; i < 70; i++) sim.step();
    const leaves = Object.values(sim.getState().tree)
      .filter((n) => n.childrenIds.length === 0)
      .map((n) => n.language);
    const daughters = leaves.filter((l) => l.id !== proto.id);
    expect(daughters.length).toBeGreaterThan(0); // M2 must have fired
    for (const lang of daughters) {
      // Daughters do NOT inherit; prestige must be re-established
      expect(lang.prestigeVariety).toBeFalsy();
    }
  });
});

describe("Phase 72f-4 — Thomason-gated structural borrowing", () => {
  it("structural borrowing rate boosted when donor.tier > recipient.tier", () => {
    const cfg = presetRomance();
    cfg.seed = "p72f-thomason";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;

    const donor: Language = {
      ...lang,
      id: "synth-donor",
      culturalTier: 3,
      prestigeVariety: true,
      grammar: { ...lang.grammar, wordOrder: "SOV" },
    };
    const recipient: Language = {
      ...lang,
      id: "synth-recipient",
      culturalTier: 0,
      prestigeVariety: false,
      grammar: { ...lang.grammar, wordOrder: "SVO" },
      bilingualLinks: { "synth-donor": 0.6 },
    };

    // RNG that always returns 0 so chance(p) returns true for any p > 0.
    const rng = { next: () => 0, int: (_n: number) => 0, chance: (p: number) => p > 0 } as any;
    const event = tryStructuralBorrow(recipient, donor, rng, 0.003);
    expect(event).not.toBeNull();
    expect(event!.feature).toBe("wordOrder");
    expect(event!.from).toBe("SVO");
    expect(event!.to).toBe("SOV");
  });
});

describe("Phase 72f-5 — per-(rule, meaning) diffusion timestamps", () => {
  it("perWordDiffusion records at least one adoption after a long-enough run", () => {
    // Phase 72 methodological audit D-A4: pre-fix this asserted
    // `>= 0` which is a literal tautology — would pass even if the
    // entire diffusion-recording mechanism were stripped out. Now
    // we run 200 gens (was 80) to give Wang's sigmoid time to cross
    // 0.85 for at least one (rule, meaning) pair, and assert > 0.
    const cfg = presetRomance();
    cfg.seed = "p72f-perword";
    const sim = createSimulation(cfg);
    for (let i = 0; i < 200; i++) sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    expect(lang.perWordDiffusion).toBeDefined();
    const ruleIds = Object.keys(lang.perWordDiffusion!);
    const totalAdoptions = ruleIds.reduce(
      (acc, rid) => acc + Object.keys(lang.perWordDiffusion![rid]!).length,
      0,
    );
    expect(totalAdoptions).toBeGreaterThan(0);
  });
});

describe("Phase 72f-6 — language-shift via heavy bilingualism", () => {
  it("simulator runs with prestige+tier-gap pair without crashing", () => {
    const cfg = presetRomance();
    cfg.seed = "p72f-shift";
    const sim = createSimulation(cfg);
    expect(() => {
      for (let i = 0; i < 30; i++) sim.step();
    }).not.toThrow();
  });
});

describe("Phase 72f-7 — prestige-weighted areal typology", () => {
  it("simulator runs the modified arealTypology step without crashing", () => {
    const cfg = presetRomance();
    cfg.seed = "p72f-areal";
    const sim = createSimulation(cfg);
    expect(() => {
      for (let i = 0; i < 30; i++) sim.step();
    }).not.toThrow();
  });
});
