import type { Language, Meaning } from "../types";
import type { GenesisRule } from "./types";
import type { Rng } from "../rng";
import { weightedSample } from "../utils/sampling";

export function tryGenesis(
  lang: Language,
  rules: GenesisRule[],
  weights: Record<string, number>,
  globalRate: number,
  rng: Rng,
): Meaning | null {
  if (rules.length === 0) return null;
  if (!rng.chance(Math.min(1, globalRate))) return null;
  const chosen = weightedSample(rules, (r) => weights[r.id] ?? r.baseWeight, rng);
  if (!chosen) return null;
  const result = chosen.tryCoin(lang, rng);
  if (!result) return null;
  lang.lexicon[result.meaning] = result.form;
  return result.meaning;
}
