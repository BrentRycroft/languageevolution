import type { Meaning } from "../types";
import { neighborsOf } from "./neighbors";

/**
 * Meanings grouped into loose semantic clusters. Drift, loanwords, and
 * compounding prefer targets within the same cluster — so "water" is much
 * more likely to shift to "river" than to "heart". Non-seed / derived words
 * fall back to the static-neighbor table.
 */
export const SEMANTIC_CLUSTERS: Readonly<Record<string, readonly Meaning[]>> = {
  body: [
    "hand", "foot", "heart", "head", "eye", "ear", "mouth", "tooth",
    "bone", "blood", "hair",
  ],
  kinship: ["mother", "father"],
  environment: [
    "water", "fire", "stone", "tree", "sun", "moon", "star", "night",
  ],
  animals: ["dog", "wolf", "horse", "cow", "fish", "bird", "snake"],
  motion: ["go", "come"],
  perception: ["see", "know"],
  metabolism: ["eat", "drink", "sleep", "die"],
  numbers: ["one", "two", "three"],
  evaluation: ["big", "small", "new", "old", "good", "bad"],
};

const MEANING_TO_CLUSTER: Record<Meaning, string> = (() => {
  const out: Record<Meaning, string> = {};
  for (const [name, members] of Object.entries(SEMANTIC_CLUSTERS)) {
    for (const m of members) out[m] = name;
  }
  return out;
})();

export function clusterOf(meaning: Meaning): string | undefined {
  return MEANING_TO_CLUSTER[meaning];
}

/**
 * Return meanings likely to be "close" to `meaning`, favouring the same
 * semantic cluster when possible. Combines the static neighbor table with
 * cluster-mates so derived words inherit cluster gravity through their
 * constituents.
 */
export function relatedMeanings(meaning: Meaning): Meaning[] {
  const out = new Set<Meaning>();
  const cluster = clusterOf(meaning);
  if (cluster) {
    for (const m of SEMANTIC_CLUSTERS[cluster] ?? []) {
      if (m !== meaning) out.add(m);
    }
  }
  for (const n of neighborsOf(meaning)) out.add(n);
  return Array.from(out);
}
