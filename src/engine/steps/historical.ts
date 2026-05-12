/**
 * steps/historical.ts — Phase 70 T1+T2: Historical Mode runner.
 *
 * Per-generation hook that consults the active `HistoricalSchedule`
 * (looked up from `config.historical?.scheduleId`) and fires any
 * milestone whose `atGen` has been reached. Idempotent: each fired
 * milestone's key is appended to `state.firedHistoricalMilestones`
 * and skipped on re-evaluation.
 *
 * T1 shipped `BiasMilestone` handling (rate / weight nudges +
 * volatility upheaval). T2 adds `SplitMilestone`: forces a tree split
 * on every leaf carrying `parentRole`, tags daughters with declared
 * roles, optionally applies an `initialBias` to each daughter.
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
  SplitMilestone,
} from "../historical/types";
import { milestoneKey } from "../historical/types";
import type { Rng } from "../rng";
import { triggerVolatilityUpheaval } from "./volatility";
import { pushEvent } from "./helpers";
import { splitLeaf } from "../tree/split";
import type { WorldMap } from "../geo/map";
import type {
  Language,
  SimulationConfig,
  SimulationState,
} from "../types";
import type { RuleFamily } from "../phonology/generated-types";

/**
 * Phase 72a T4 (Contract C8 fix): bound on state.historicalEvents.
 * Pre-72a the array was append-only — long runs (1000+ gens with
 * frequent milestone re-evaluation) bloated saves. The TimelineChart
 * UI only ever needs recent events (most recent ~100 milestones); a
 * cap of 200 is comfortably above that.
 */
const HISTORICAL_EVENTS_CAP = 200;

/**
 * Phase 72 methodological audit D-A1: exported for tests so we can
 * verify the cap mechanism without rebuilding the entire Historical
 * Mode milestone trigger chain. Production callers stay in this file.
 */
export function recordHistoricalEvent(
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
  // Drop oldest entries if cap exceeded (FIFO).
  if (state.historicalEvents.length > HISTORICAL_EVENTS_CAP) {
    state.historicalEvents.splice(0, state.historicalEvents.length - HISTORICAL_EVENTS_CAP);
  }
}

/**
 * Phase 71a T1 (G1): clamp bounds for ruleBias / ruleWeight after a
 * milestone multiplies onto the existing value. Pre-71a, M1+M2+M3+M7
 * lenition factors compounded into Castilian `ruleBias.lenition = 11.73`,
 * which produced unreadable phonological outputs. The clamps mirror
 * the natural range that organic engine drift produces.
 */
const RULE_BIAS_MIN = 0.2;
const RULE_BIAS_MAX = 4.0;
const RULE_WEIGHT_MIN = 0.05;
const RULE_WEIGHT_MAX = 12.0;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
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
      lang.ruleBias[key] = clamp(current * scale(factor!), RULE_BIAS_MIN, RULE_BIAS_MAX);
    }
  }
  if (m.ruleWeight) {
    if (!lang.changeWeights) lang.changeWeights = {};
    for (const [id, factor] of Object.entries(m.ruleWeight)) {
      const current = lang.changeWeights[id];
      if (current === undefined) continue;
      lang.changeWeights[id] = clamp(
        current * scale(factor),
        RULE_WEIGHT_MIN,
        RULE_WEIGHT_MAX,
      );
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
  // Phase 71d (G3+G5): direct grammatical-feature override. Applied
  // when intensity > 0; intensity scaling doesn't apply (these are
  // boolean / categorical fields, not multiplicative factors). The
  // patch overwrites lang.grammar.* per declared key.
  if (m.grammarPatch && intensity > 0) {
    Object.assign(lang.grammar, m.grammarPatch);
  }
  // Phase 71d (G3): suppress word-order drift until the declared gen.
  // grammar/evolve.ts:maybeDriftWordOrder respects
  // wordOrderLastFlipGen + WORD_ORDER_FLIP_COOLDOWN as a "no-flip
  // before this gen" gate, so writing a far-future value pins the
  // word order until then.
  if (m.lockWordOrderUntilGen !== undefined && intensity > 0) {
    lang.wordOrderLastFlipGen = m.lockWordOrderUntilGen;
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
function leavesByRole(
  state: SimulationState,
  role: HistoricalRoleId,
): Array<{ id: string; lang: Language }> {
  const out: Array<{ id: string; lang: Language }> = [];
  for (const id of Object.keys(state.tree)) {
    const node = state.tree[id]!;
    if (node.childrenIds.length > 0) continue;
    const lang = node.language;
    if (lang.historicalRole === role) out.push({ id, lang });
  }
  return out;
}

/**
 * T2: apply a `SplitMilestone`. For every leaf carrying `parentRole`,
 * call `splitLeaf` with childCount = daughters.length. Then tag each
 * resulting daughter with its declared role + nameHint, and apply any
 * `initialBias`. Existing tree machinery (split.ts) handles all the
 * usual daughter wiring (lexicon clone, inventory copy, jitter, etc.);
 * we just override the role tag and seed an initial bias on top.
 */
function applySplitMilestone(
  state: SimulationState,
  m: SplitMilestone,
  generation: number,
  rng: Rng,
  intensity: number,
  worldMap: WorldMap,
): { firedCount: number; daughterCount: number } {
  const parents = leavesByRole(state, m.parentRole).filter((p) => !p.lang.extinct);
  let daughterCount = 0;
  for (const { id, lang: parentLang } of parents) {
    const childIds = splitLeaf(state.tree, id, generation, rng, {
      childCount: m.daughters.length,
      worldMap,
    });
    for (let i = 0; i < childIds.length && i < m.daughters.length; i++) {
      const daughter = state.tree[childIds[i]!]!.language;
      const spec = m.daughters[i]!;
      daughter.historicalRole = spec.role;
      daughter.historicalRoleAssignedGen = generation;
      if (spec.nameHint) daughter.name = spec.nameHint;
      if (spec.initialBias) {
        applyBiasMilestone(
          daughter,
          {
            kind: "bias",
            atGen: generation,
            role: spec.role,
            label: `${m.label} → ${spec.role}`,
            ...spec.initialBias,
          },
          generation,
          rng,
          intensity,
        );
      }
      pushEvent(daughter, {
        generation,
        kind: "historical_milestone",
        description: `[historical:split] ${m.label} → ${spec.role} (from ${parentLang.id})`,
        meta: { pathway: "historical-split" },
      });
      daughterCount++;
    }
  }
  return { firedCount: parents.length, daughterCount };
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
  worldMap: WorldMap,
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
      const targets = leavesByRole(state, m.role).filter(({ lang }) => !lang.extinct);
      if (targets.length === 0) {
        logSkippedMilestone(state, m, generation, `no living leaf with role "${m.role}"`);
      } else {
        for (const { lang } of targets) {
          applyBiasMilestone(lang, m, generation, rng, intensity);
        }
        recordHistoricalEvent(state, generation, m.label, m.role, "fired");
      }
    } else if (m.kind === "split") {
      const result = applySplitMilestone(state, m, generation, rng, intensity, worldMap);
      if (result.firedCount === 0) {
        logSkippedMilestone(
          state,
          m,
          generation,
          `no living leaf with role "${m.parentRole}"`,
        );
      } else {
        recordHistoricalEvent(state, generation, m.label, m.parentRole, "fired");
      }
    }

    fired.add(key);
    state.firedHistoricalMilestones.push(key);
  }
}
