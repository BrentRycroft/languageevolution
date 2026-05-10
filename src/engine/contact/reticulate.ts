import type { ReticulateLink, SimulationState } from "../types";

/**
 * reticulate.ts — Phase 72g T2.
 *
 * Network-topology view of language contact. Pre-72g the simulator's
 * tree was strictly cladistic (LanguageNode.parentId → single parent),
 * with horizontal contact tracked indirectly via per-language
 * bilingualLinks. This module surfaces a global, persistent list of
 * reticulate links so consumers can iterate the network topology
 * without scanning every leaf.
 *
 * Refreshed each generation by `refreshContactLinks(state, threshold)`.
 * Links with strength < threshold are pruned; existing links above the
 * threshold get their `lastSeenGen` updated.
 */

const DEFAULT_LINK_THRESHOLD = 0.25;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Build / refresh the reticulate link list from current bilingualLinks
 * across all leaves. Symmetric: only one entry per unordered pair.
 * Links absent from the new pass (strength below threshold) are pruned
 * from `state.contactLinks`.
 */
export function refreshContactLinks(
  state: SimulationState,
  generation: number,
  threshold: number = DEFAULT_LINK_THRESHOLD,
): void {
  const existing = new Map<string, ReticulateLink>();
  for (const link of state.contactLinks ?? []) {
    existing.set(pairKey(link.langA, link.langB), link);
  }

  const seen = new Set<string>();
  for (const id of Object.keys(state.tree)) {
    const lang = state.tree[id]!.language;
    if (lang.extinct || !lang.bilingualLinks) continue;
    for (const partnerId of Object.keys(lang.bilingualLinks)) {
      const strength = lang.bilingualLinks[partnerId] ?? 0;
      if (strength < threshold) continue;
      const partnerNode = state.tree[partnerId];
      if (!partnerNode || partnerNode.language.extinct) continue;
      const key = pairKey(id, partnerId);
      if (seen.has(key)) continue;
      seen.add(key);
      const prior = existing.get(key);
      if (prior) {
        prior.strength = Math.max(prior.strength, strength);
        prior.lastSeenGen = generation;
      } else {
        existing.set(key, {
          langA: id < partnerId ? id : partnerId,
          langB: id < partnerId ? partnerId : id,
          kind: "bilingual",
          strength,
          firstSeenGen: generation,
          lastSeenGen: generation,
        });
      }
    }
  }

  // Drop links that weren't seen this gen (their strength fell below
  // threshold or one endpoint went extinct).
  state.contactLinks = [];
  for (const [key, link] of existing) {
    if (seen.has(key)) state.contactLinks.push(link);
  }
}

/**
 * Iterate links involving `langId`. Convenience for callers that want
 * "all my contact partners" without re-scanning the global list.
 */
export function linksFor(state: SimulationState, langId: string): ReticulateLink[] {
  if (!state.contactLinks) return [];
  return state.contactLinks.filter(
    (l) => l.langA === langId || l.langB === langId,
  );
}
