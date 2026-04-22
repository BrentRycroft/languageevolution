import type { SimulationState } from "../types";
import { ACHIEVEMENTS } from "./catalog";

/**
 * Given the previously unlocked achievement ids and the current state,
 * return the set of newly-unlocked ids. Idempotent: if no new achievements
 * pass their predicate, returns an empty array.
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
