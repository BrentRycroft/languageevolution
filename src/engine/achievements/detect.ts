import type { SimulationState } from "../types";
import { ACHIEVEMENTS } from "./catalog";

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
