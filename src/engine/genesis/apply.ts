import type { Language, Meaning } from "../types";
import type { GenesisRule } from "./types";
import type { Rng } from "../rng";

export function tryGenesis(
  lang: Language,
  rules: GenesisRule[],
  weights: Record<string, number>,
  globalRate: number,
  rng: Rng,
): Meaning | null {
  if (rules.length === 0) return null;
  if (!rng.chance(Math.min(1, globalRate))) return null;
  const totalWeight = rules.reduce((s, r) => s + (weights[r.id] ?? r.baseWeight), 0);
  if (totalWeight <= 0) return null;
  let pick = rng.next() * totalWeight;
  let chosen: GenesisRule | null = null;
  for (const r of rules) {
    const w = weights[r.id] ?? r.baseWeight;
    pick -= w;
    if (pick <= 0) {
      chosen = r;
      break;
    }
  }
  if (!chosen) return null;
  const result = chosen.tryCoin(lang, rng);
  if (!result) return null;
  lang.lexicon[result.meaning] = result.form;
  return result.meaning;
}
