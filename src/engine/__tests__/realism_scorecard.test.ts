import { describe, it, expect } from "vitest";
import { PRESETS } from "../presets";
import { createSimulation } from "../simulation";
import { lexKeys, lexGet } from "../lexicon/access";
import { formToString } from "../phonology/ipa";
import { fnv1a } from "../rng";
import { YEARS_PER_GENERATION } from "../constants";
import type { SimulationConfig, SimulationState } from "../types";
import {
  soleLeaf,
  captureSeed,
  swadeshRetention,
  renderRows,
  summarize,
  type DiagnosticRow,
} from "../diagnostics/scorecard";
import { buildScorecard } from "../diagnostics/buildScorecard";

/**
 * realism_scorecard.test.ts — the holistic SIMULATION SCORECARD (RUN_SLOW).
 *
 * Lane 0 of the MEGA-OVERHAUL (docs/planning/MEGA-OVERHAUL-2026-06.md §0.1,
 * "Lane 0 — Holistic Simulation Scorecard"). This is the day-to-day GATE and
 * the measurement spine for the whole overhaul.
 *
 * It is a REPORT, not a brittle lock. Every check is a DIAGNOSTIC WITH A
 * PREFERRED VALUE: each row prints `actual / preferred / band` → PASS/WARN/FAIL.
 * The diagnostic groups (all driven by `diagnostics/scorecard.ts` +
 * `diagnostics/buildScorecard.ts` + `diagnostics/translatorCorpus.ts`):
 *
 *   typology   — Greenberg-axis consistency + per-preset declared-axis match
 *                (folds the *_typolog* / *_agnosticism / universals locks in)
 *   lexicon    — size stationarity, birth/death balance
 *   phonology  — onset profile, inventory diversity, regular-vs-per-word share,
 *                chain-shift texture
 *   semantics  — colexification rate, antonym embedding separation, antonym-drift
 *   retention  — Swadesh glottochronology curve
 *   translator — the 5 user test phrases + placeholder (Lane F corpus)
 *   perf       — byte-identity / reproducibility (DEMOTED, non-gating)
 *
 * CALIBRATION PHILOSOPHY (user 2026-06-03): a row going red may mean the
 * PRE-EXISTING preferred value is wrong for the new system — not that the new
 * change is wrong. Tests are tools, not ground truth. So the only HARD assertions
 * below are catastrophe / sanity floors (finite numbers, no total collapse, no
 * runaway); everything else is reported and the suite stays green-to-report.
 *
 * Each preset evolves as a SINGLE non-splitting, non-dying lineage so the
 * Swadesh retention curve tracks one clean glottochronology lineage vs gen-0.
 */

// 25 yr/gen → 40 gens = 1000 years (the glottochronology checkpoint).
const CHECKPOINTS = [40, 100, 200] as const; // 1000, 2500, 5000 years
const HORIZON = CHECKPOINTS[CHECKPOINTS.length - 1];

function scorecardConfig(build: () => SimulationConfig): SimulationConfig {
  const cfg = build();
  // Single clean lineage: no cladogenesis, no extinction.
  cfg.tree = { ...cfg.tree, splitProbabilityPerGeneration: 0 };
  cfg.modes = { ...cfg.modes, death: false };
  return cfg;
}

/** Deterministic hash of the sole-leaf lexicon (gloss → form) — for the perf diagnostic. */
function lexSignature(state: SimulationState): string {
  const lang = soleLeaf(state);
  const lex = lexKeys(lang)
    .sort()
    .map((m) => `${m}=${formToString(lexGet(lang, m)!)}`)
    .join("|");
  return fnv1a(lex).toString(16).padStart(8, "0");
}

describe("Simulation Scorecard (RUN_SLOW)", () => {
  for (const preset of PRESETS) {
    it(`${preset.id}: holistic diagnostics report`, () => {
      const sim = createSimulation(scorecardConfig(preset.build));
      const seed = captureSeed(soleLeaf(sim.getState()));
      const seedInvSize = soleLeaf(sim.getState()).phonemeInventory.segmental.length;

      // ── PERF DIAGNOSTIC: same-seed reproducibility (a thin determinism check) ──
      // Re-run a few steps on a fresh sim with the same config; the lexicon
      // signature must match. This is the DEMOTED byte-identity check: it is a
      // reproducibility diagnostic, NOT a vs-prior-baseline lock.
      const reproA = createSimulation(scorecardConfig(preset.build));
      const reproB = createSimulation(scorecardConfig(preset.build));
      for (let i = 0; i < 10; i++) {
        reproA.step();
        reproB.step();
      }
      const reproMatch = lexSignature(reproA.getState()) === lexSignature(reproB.getState());

      // ── Evolve the measured lineage across the checkpoints ──
      const curve: Array<{ gen: number; swadesh: number }> = [];
      let gen = 0;
      const t0 = Date.now();
      for (const cp of CHECKPOINTS) {
        while (gen < cp) {
          sim.step();
          gen++;
        }
        curve.push({ gen, swadesh: swadeshRetention(seed, soleLeaf(sim.getState())) });
      }
      const elapsedMs = Date.now() - t0;

      const lang = soleLeaf(sim.getState());
      const rows: DiagnosticRow[] = buildScorecard({
        presetId: preset.id,
        seed,
        seedInvSize,
        lang,
        swadesh1000: curve[0]!.swadesh,
        horizonGens: HORIZON,
      });

      // perf rows (non-gating)
      rows.push({
        group: "perf",
        label: "same-seed reproducibility (10 gens)",
        actual: reproMatch ? "identical" : "DIVERGED",
        preferred: "identical",
        band: "same seed ⇒ same output",
        status: reproMatch ? "PASS" : "FAIL",
      });
      rows.push({
        group: "perf",
        label: `evolve ${HORIZON} gens wall-time`,
        actual: `${elapsedMs}ms`,
        preferred: "(timing only)",
        band: "(non-gating)",
        status: "INFO",
      });

      const curveLine =
        `  Swadesh curve  ` +
        curve.map((c) => `${c.gen * YEARS_PER_GENERATION}yr=${(c.swadesh * 100).toFixed(1)}%`).join("  ");
      const report =
        renderRows(
          `SCORECARD ${preset.id} — single lineage, ${HORIZON} gens / ${HORIZON * YEARS_PER_GENERATION} yr`,
          rows,
        ) + `\n${curveLine}`;
      // eslint-disable-next-line no-console
      console.log(report);

      // ── HARD assertions: catastrophe / sanity floors ONLY (see header). ──
      // The scorecard is a report; we only fail the build on a true collapse,
      // a non-finite metric, or a determinism break.
      const swadesh1000 = curve[0]!.swadesh;
      expect(swadesh1000, "Swadesh @1000yr is a finite share").toBeGreaterThan(0);
      expect(swadesh1000).toBeLessThanOrEqual(1);
      // Deep-time catastrophe floor (not the calibration target — that's a row).
      expect(curve[curve.length - 1]!.swadesh, "no deep-time Swadesh collapse").toBeGreaterThan(0.05);
      // Lexicon must not runaway or vanish.
      const sizeRatio = lexKeys(lang).length / Math.max(1, seed.size);
      expect(sizeRatio, "lexicon not vanished").toBeGreaterThan(0.4);
      expect(sizeRatio, "lexicon not runaway").toBeLessThan(8);
      // Determinism is REQUIRED (the one perf row that is still a hard gate).
      expect(reproMatch, `${preset.id}: same seed must reproduce identically`).toBe(true);

      // Every row carries a status (the report is well-formed).
      const s = summarize(rows);
      expect(s.pass + s.warn + s.fail + s.info).toBe(rows.length);
      expect(rows.length).toBeGreaterThan(20);
    });
  }
});
