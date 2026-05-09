/**
 * historical/types.ts — Phase 70: Historical Mode (HOI4-style soft railroad).
 *
 * Schedule of biasing nudges and forced splits that steer a preset run
 * toward a known historical outcome. The procedural engine is unchanged;
 * the runner in `steps/historical.ts` only mutates the same per-language
 * runtime knobs (`ruleBias`, `changeWeights`, `categoryMomentum`,
 * `volatilityPhase`) that the organic engine already writes to.
 *
 * Design: see /root/.claude/plans/i-want-to-make-modular-quill.md
 */

import type { RuleFamily } from "../phonology/generated-types";
import type { GrammarFeatures } from "../types";

/**
 * Tag applied to leaves to identify which milestone targets affect them.
 * The proto-language is tagged "proto" at init when Historical Mode is
 * on; daughters of a `SplitMilestone` are tagged with the daughter role
 * declared in the schedule. Random splits inherit the parent's role.
 *
 * The set is intentionally Romance-leaning at T1; future pathways
 * (Germanic, Indo-Iranian, Sinitic) will extend this union.
 */
export type HistoricalRoleId =
  | "proto"
  // Romance branches:
  | "western"
  | "eastern"
  | "iberian"
  | "gallo"
  | "italo"
  | "castilian"
  | "lusitanian"
  | "occitano"
  | "francien"
  | "tuscan"
  | "daco";

/**
 * A scheduled per-generation soft nudge on one (already-existing) branch.
 * All multiplicative fields (`ruleBias`, `ruleWeight`) are MULTIPLIED
 * onto the live values; existing biases stack.
 */
export interface BiasMilestone {
  kind: "bias";
  /** Generation (0-indexed) at which the milestone fires. */
  atGen: number;
  /** Targets every leaf currently carrying this role. */
  role: HistoricalRoleId;
  /** Human-readable label, used by EventsLog / TimelineChart / narrative. */
  label: string;
  /** Multiplicative factors on `lang.ruleBias[family]` (RuleFamily keys). */
  ruleBias?: Partial<Record<RuleFamily, number>>;
  /** Multiplicative factors on `lang.changeWeights[ruleId]`. */
  ruleWeight?: Record<string, number>;
  /** Seed `lang.categoryMomentum[cat] = { boost, until: gen + forGens }`. */
  categoryMomentum?: Record<string, { boost: number; forGens: number }>;
  /** Trigger a `volatilityPhase` upheaval. Reuses `triggerVolatilityUpheaval`. */
  volatility?: { multiplier?: number; forGens?: number; trigger?: string };
  /**
   * Phase 71d (G3+G5): direct write to `lang.grammar.*`. Lets the
   * schedule force grammatical typology that organic drift won't
   * deliver reliably (e.g., Western Romance dropping `hasCase: true
   * → false`). Object.assign'd onto lang.grammar in
   * applyBiasMilestone — overrides existing values per key.
   */
  grammarPatch?: Partial<GrammarFeatures>;
  /**
   * Phase 71d (G3): writes `lang.wordOrderLastFlipGen` to suppress
   * word-order drift. Setting this to a far-future generation
   * effectively pins the word order for the rest of the run.
   * Pre-71d, Castilian / Lusitanian / Occitano routinely drifted
   * to SOV / VSO over 200 gens despite the Romance railroad.
   */
  lockWordOrderUntilGen?: number;
}

/**
 * Force a tree split on every leaf carrying `parentRole`, tagging the
 * resulting daughters with the declared roles. T1 ships the type but
 * the runner only handles `kind: "bias"`; the splitter ships in T2.
 */
export interface SplitMilestone {
  kind: "split";
  atGen: number;
  parentRole: HistoricalRoleId;
  label: string;
  daughters: ReadonlyArray<{
    role: HistoricalRoleId;
    nameHint?: string;
    initialBias?: Pick<
      BiasMilestone,
      "ruleBias" | "ruleWeight" | "categoryMomentum"
      | "grammarPatch" | "lockWordOrderUntilGen"
    >;
  }>;
}

export type HistoricalMilestone = BiasMilestone | SplitMilestone;

/**
 * A complete historical pathway. Attaches to a preset by id; the engine
 * only consults schedules whose `presetId` matches `config.preset`.
 */
export interface HistoricalSchedule {
  id: string;
  label: string;
  description: string;
  presetId: string;
  milestones: ReadonlyArray<HistoricalMilestone>;
  /** Optional terminal-leaf naming hint per role. T2+. */
  terminalNames?: Partial<Record<HistoricalRoleId, string>>;
}

/**
 * Build a stable idempotency key for a milestone. The runner appends
 * this to `state.firedHistoricalMilestones` after firing.
 */
export function milestoneKey(m: HistoricalMilestone): string {
  const role = m.kind === "split" ? m.parentRole : m.role;
  return `${m.atGen}:${m.kind}:${role}:${m.label}`;
}
