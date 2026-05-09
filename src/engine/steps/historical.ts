/**
 * steps/historical.ts — Phase 70 T1: Historical Mode runner.
 *
 * Per-generation hook that consults the active `HistoricalSchedule`
 * (looked up from `config.historical?.scheduleId`) and fires any
 * milestone whose `atGen` has been reached. Idempotent: each fired
 * milestone's key is appended to `state.firedHistoricalMilestones`
 * and skipped on re-evaluation.
 *
 * T1 handles only `BiasMilestone` (rate / weight nudges + volatility
 * upheaval). `SplitMilestone` is detected but no-op'd — implementation
 * ships in T2.
 *
 * Pipeline order: runs once per generation, OUTSIDE the per-leaf loop,
 * BEFORE `stepVolatility` and `stepTreeSplit`. When `scheduleId` is
 * undefined the entire step is skipped — zero RNG draws preserves
 * existing-run determinism.
 */

import { findSchedule } from "../historical";
import type {
  BiasMilestone,
  HistoricalMilestone,
  HistoricalRoleId,
} from "../historical/types";
import { milestoneKey } from "../historical/types";
import type { Rng } from "../rng";
import { triggerVolatilityUpheaval } from "./volatility";
import { pushEvent } from "./helpers";
import type {
  Language,
  SimulationConfig,
  SimulationState,
} from "../types";
import type { RuleFamily } from "../phonology/generated-types";

function recordHistoricalEvent(
  state: SimulationState,
  generation: number,
  label: string,
  role: string,
  kind: "fired" | "skipped",
  reason?: string,
): void {
  if (!state.historicalEvents) state.historicalEvents = [];
  state.historicalEvents.push(
    reason ? { generation, label, role, kind, reason } : { generation, label, role, kind },
  );
}

/**
 * Apply a `BiasMilestone` to one already-tagged language. Multiplies
 * existing values; existing biases stack.
 */
function applyBiasMilestone(
  lang: Language,
  m: BiasMilestone,
  generation: number,
  rng: Rng,
  intensity: number,
): void {
  // Scale a multiplicative factor by intensity. intensity=1 is the
  // identity; intensity=0 fully neutralises the milestone (factor=1);
  // intensity=2 doubles the deviation from 1.0.
  const scale = (factor: number): number => 1 + intensity * (factor - 1);

  if (m.ruleBias) {
    if (!lang.ruleBias) lang.ruleBias = {} as Record<RuleFamily, number>;
    for (const [fam, factor] of Object.entries(m.ruleBias)) {
      const key = fam as RuleFamily;
      const current = lang.ruleBias[key] ?? 1;
      lang.ruleBias[key] = current * scale(factor!);
    }
  }
  if (m.ruleWeight) {
    if (!lang.changeWeights) lang.changeWeights = {};
    for (const [id, factor] of Object.entries(m.ruleWeight)) {
      const current = lang.changeWeights[id];
      if (current === undefined) continue;
      lang.changeWeights[id] = current * scale(factor);
    }
  }
  if (m.categoryMomentum) {
    if (!lang.categoryMomentum) lang.categoryMomentum = {};
    for (const [cat, spec] of Object.entries(m.categoryMomentum)) {
      const boost = scale(spec.boost);
      lang.categoryMomentum[cat] = {
        boost,
        until: generation + spec.forGens,
      };
    }
  }
  if (m.volatility && intensity > 0) {
    triggerVolatilityUpheaval(
      lang,
      generation,
      rng,
      m.volatility.trigger ?? m.label,
    );
  }

  pushEvent(lang, {
    generation,
    kind: "historical_milestone",
    description: `[historical] ${m.label}`,
    meta: {
      pathway: "historical",
    },
  });
}

/**
 * Find every leaf currently carrying `role`. Called once per milestone.
 * Includes extinct leaves so we can log a degraded skip-event on them.
 */
function leavesByRole(state: SimulationState, role: HistoricalRoleId): Language[] {
  const out: Language[] = [];
  for (const id of Object.keys(state.tree)) {
    const node = state.tree[id]!;
    if (node.childrenIds.length > 0) continue;
    const lang = node.language;
    if (lang.historicalRole === role) out.push(lang);
  }
  return out;
}

/**
 * Push a degraded "skipped" event onto the proto's events list when a
 * milestone targets a role with no living bearer. Surfaced in probes
 * via `state.historicalMilestonesSkipped`.
 */
function logSkippedMilestone(
  state: SimulationState,
  m: HistoricalMilestone,
  generation: number,
  reason: string,
): void {
  state.historicalMilestonesSkipped =
    (state.historicalMilestonesSkipped ?? 0) + 1;
  const role = m.kind === "split" ? m.parentRole : m.role;
  recordHistoricalEvent(state, generation, m.label, role, "skipped", reason);
  const proto = state.tree[state.rootId]?.language;
  if (!proto) return;
  pushEvent(proto, {
    generation,
    kind: "historical_milestone",
    description: `[historical:skipped] ${m.label} — ${reason}`,
    meta: { pathway: "historical-skipped" },
  });
}

/**
 * Per-generation Historical Mode runner. No-op when scheduleId is unset
 * or doesn't match a registered schedule; in that case zero RNG draws
 * happen and existing-run determinism is preserved.
 */
export function stepHistorical(
  state: SimulationState,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  const scheduleId = config.historical?.scheduleId;
  if (!scheduleId) return;
  const schedule = findSchedule(scheduleId);
  if (!schedule) return;
  if (schedule.presetId !== config.preset) return;

  const intensity = config.historical?.intensity ?? 1.0;
  if (!state.firedHistoricalMilestones) state.firedHistoricalMilestones = [];
  const fired = new Set(state.firedHistoricalMilestones);

  for (const m of schedule.milestones) {
    if (m.atGen > generation) break; // milestones are sorted; early exit.
    const key = milestoneKey(m);
    if (fired.has(key)) continue;

    if (m.kind === "bias") {
      const targets = leavesByRole(state, m.role).filter((l) => !l.extinct);
      if (targets.length === 0) {
        logSkippedMilestone(state, m, generation, `no living leaf with role "${m.role}"`);
      } else {
        for (const lang of targets) {
          applyBiasMilestone(lang, m, generation, rng, intensity);
        }
        recordHistoricalEvent(state, generation, m.label, m.role, "fired");
      }
    } else if (m.kind === "split") {
      // T2 implements the split runner. T1 logs and marks fired so
      // we don't repeatedly evaluate it.
      logSkippedMilestone(state, m, generation, "split milestones not yet implemented (T2)");
    }

    fired.add(key);
    state.firedHistoricalMilestones.push(key);
  }
}
