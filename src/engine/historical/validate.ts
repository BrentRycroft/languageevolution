/**
 * historical/validate.ts — Phase 70 T1: schedule sanity check.
 *
 * Run at boot when a schedule is selected. Catches:
 *  - Unknown rule ids in `BiasMilestone.ruleWeight` (catalog drift).
 *  - Unknown RuleFamily keys in `BiasMilestone.ruleBias`.
 *  - Out-of-order milestones (`atGen` strictly increasing).
 *
 * Errors are warnings rather than throws — silent no-op of a stale
 * weight is recoverable; the schedule still applies its other nudges.
 */

import { CATALOG_BY_ID } from "../phonology/catalog";
import type { RuleFamily } from "../phonology/generated-types";
import type { HistoricalSchedule } from "./types";

const KNOWN_FAMILIES: ReadonlySet<RuleFamily> = new Set<RuleFamily>([
  "lenition",
  "fortition",
  "place_assim",
  "palatalization",
  "vowel_shift",
  "vowel_reduction",
  "harmony",
  "deletion",
  "metathesis",
  "tone",
]);

export interface ScheduleValidationIssue {
  kind: "unknown-rule-id" | "unknown-family" | "atgen-disorder";
  message: string;
}

export function validateSchedule(schedule: HistoricalSchedule): ScheduleValidationIssue[] {
  const issues: ScheduleValidationIssue[] = [];
  let lastAtGen = -Infinity;
  for (const m of schedule.milestones) {
    if (m.atGen < lastAtGen) {
      issues.push({
        kind: "atgen-disorder",
        message: `[${schedule.id}] milestone "${m.label}" at gen ${m.atGen} is out of order (previous: ${lastAtGen}).`,
      });
    }
    lastAtGen = m.atGen;
    if (m.kind === "bias") {
      checkBias(
        schedule.id,
        m.label,
        m.ruleBias,
        m.ruleWeight,
        issues,
      );
    } else if (m.kind === "split") {
      // T2: validate each daughter's initialBias structure too.
      for (const d of m.daughters) {
        if (!d.initialBias) continue;
        checkBias(
          schedule.id,
          `${m.label} → ${d.role}`,
          d.initialBias.ruleBias,
          d.initialBias.ruleWeight,
          issues,
        );
      }
    }
  }
  return issues;
}

function checkBias(
  scheduleId: string,
  label: string,
  ruleBias: Partial<Record<string, number>> | undefined,
  ruleWeight: Record<string, number> | undefined,
  issues: ScheduleValidationIssue[],
): void {
  if (ruleBias) {
    for (const fam of Object.keys(ruleBias)) {
      if (!KNOWN_FAMILIES.has(fam as RuleFamily)) {
        issues.push({
          kind: "unknown-family",
          message: `[${scheduleId}] milestone "${label}" references unknown RuleFamily "${fam}".`,
        });
      }
    }
  }
  if (ruleWeight) {
    for (const id of Object.keys(ruleWeight)) {
      if (!CATALOG_BY_ID[id]) {
        issues.push({
          kind: "unknown-rule-id",
          message: `[${scheduleId}] milestone "${label}" references unknown catalog rule id "${id}".`,
        });
      }
    }
  }
}
