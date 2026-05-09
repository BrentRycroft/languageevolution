/**
 * historical/index.ts — Phase 70: Historical Mode registry.
 *
 * Re-exports types and the catalog of registered schedules. The UI
 * filters this list by `presetId` to populate the pathway dropdown;
 * the engine looks up schedules by `id` from `config.historical`.
 *
 * To add a new pathway:
 *   1. Create historical/<pathway>/index.ts with the schedule data.
 *   2. Import + append to HISTORICAL_SCHEDULES below.
 *   3. Add a case to validateScheduleRuleIds() if it references
 *      catalog rule ids (T2+ schedules will).
 */

import type { HistoricalSchedule } from "./types";
import { romanceSchedule } from "./romance";

export type {
  HistoricalSchedule,
  HistoricalMilestone,
  BiasMilestone,
  SplitMilestone,
  HistoricalRoleId,
} from "./types";
export { milestoneKey } from "./types";

export const HISTORICAL_SCHEDULES: readonly HistoricalSchedule[] = [
  romanceSchedule,
];

export function findSchedule(id: string | undefined): HistoricalSchedule | undefined {
  if (!id) return undefined;
  return HISTORICAL_SCHEDULES.find((s) => s.id === id);
}

export function schedulesForPreset(presetId: string | undefined): HistoricalSchedule[] {
  if (!presetId) return [];
  return HISTORICAL_SCHEDULES.filter((s) => s.presetId === presetId);
}
