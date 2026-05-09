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
    if (m.kind !== "bias") continue;
    if (m.ruleBias) {
      for (const fam of Object.keys(m.ruleBias)) {
        if (!KNOWN_FAMILIES.has(fam as RuleFamily)) {
          issues.push({
            kind: "unknown-family",
            message: `[${schedule.id}] milestone "${m.label}" references unknown RuleFamily "${fam}".`,
          });
        }
      }
    }
    if (m.ruleWeight) {
      for (const id of Object.keys(m.ruleWeight)) {
        if (!CATALOG_BY_ID[id]) {
          issues.push({
            kind: "unknown-rule-id",
            message: `[${schedule.id}] milestone "${m.label}" references unknown catalog rule id "${id}".`,
          });
        }
      }
    }
  }
  return issues;
}
