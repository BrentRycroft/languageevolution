import type { SimulationState } from "../types";
import { ACHIEVEMENTS } from "./catalog";

/**
 * detect.ts
 *
 * Achievement catalog + per-event detection. Key exports: detectNewAchievements.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export function detectNewAchievements(
  unlocked: ReadonlySet<string>,
  state: SimulationState,
): string[] {
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id)) continue;
    if (a.predicate(state)) fresh.push(a.id);
  }
  return fresh;
}
