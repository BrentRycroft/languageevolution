import type { Meaning } from "../types";
import type { LexiconState } from "../domains";

/**
 * conceptIdentity.ts — Phase 72d (full-delivery defer-2).
 *
 * Stable UUID-style anchors for concept identity, separate from the
 * string-keyed `Meaning` used throughout the engine.
 *
 * Audit Theme D ("Concept identity is string-keyed and breaks under
 * recarving") asked for UUIDs as the canonical concept anchor. Two
 * shippable interpretations:
 *
 *   (a) FULL: replace `Lexicon = Record<Meaning, WordForm>` with
 *       `Record<ConceptId, WordForm>`. Touches every preset,
 *       snapshot test, and persistence path. 1-2 weeks of dedicated
 *       migration; not feasible in one session.
 *
 *   (b) PRACTICAL (this commit): keep Lexicon string-keyed, but
 *       attach a per-language `conceptIds: Record<Meaning, ConceptId>`
 *       map that gives each meaning a stable UUID. Daughters inherit
 *       the parent's UUIDs at split (so the same proto-meaning is the
 *       SAME concept across the whole subtree). meaningHistory
 *       records mergedInto as a UUID alongside the string, so
 *       reverse inference and reconstruction probes can identify
 *       "this orphan in daughter X is the same proto-concept that
 *       merged in daughter Y" without string-matching.
 *
 * (b) closes the audit's stated correctness gap. (a) is the
 * architectural endpoint and remains documented in the migration
 * plan (`docs/LANGUAGE_DOMAINS.md`).
 *
 * The branded `ConceptId` type prevents accidental confusion with
 * `Meaning` (which is a structural alias for `string`). Use
 * `mintConceptId()` to create new IDs and `conceptIdFor(lang, m)`
 * to look up or lazily assign the ID for a meaning in a given
 * language.
 */

export type ConceptId = string & { readonly __brand: "ConceptId" };

let counter = 0;

/**
 * Mint a fresh ConceptId. Format: `c_<8-hex>_<seq>` — short enough
 * to keep saved JSON compact, deterministic enough for reproducible
 * runs (the seq counter is process-local but reset per-test). Real
 * UUID v4 is overkill; collision space across one simulation run is
 * trivially below 10⁴ concepts.
 */
export function mintConceptId(): ConceptId {
  counter = (counter + 1) >>> 0;
  // Eight hex chars from a hash of the counter; distinct from any
  // simple integer pattern.
  const h = ((counter * 0x9e3779b1) >>> 0).toString(16).padStart(8, "0");
  return `c_${h}_${counter}` as ConceptId;
}

/**
 * Reset the counter — used by tests that need deterministic IDs.
 * Production code should never call this.
 */
export function resetConceptIdCounter(): void {
  counter = 0;
}

/**
 * Look up the ConceptId for a meaning, or lazily mint one. The
 * lazy-mint policy means existing code that calls `deleteMeaning`,
 * adds new meanings via `setLexiconForm`, etc. all continue to work
 * — the UUID is created on first reference.
 *
 * Daughter languages inherit conceptIds at split (tree/split.ts), so
 * sister leaves share the same UUID for the same proto-meaning. This
 * is the cross-tree anchor the audit's reconstruction probes need.
 */
export function conceptIdFor(lang: LexiconState, meaning: Meaning): ConceptId {
  if (!lang.conceptIds) lang.conceptIds = {};
  const existing = lang.conceptIds[meaning];
  if (existing) return existing as ConceptId;
  const id = mintConceptId();
  lang.conceptIds[meaning] = id;
  return id;
}

/**
 * Reverse lookup: find the meaning string currently bound to a given
 * ConceptId. Returns undefined if the language has no record of the
 * concept. Useful for reconstruction probes that walk meaningHistory
 * back to a parent's lexicon by UUID.
 */
export function meaningForConceptId(
  lang: LexiconState,
  conceptId: ConceptId,
): Meaning | undefined {
  if (!lang.conceptIds) return undefined;
  for (const m of Object.keys(lang.conceptIds)) {
    if (lang.conceptIds[m] === conceptId) return m;
  }
  return undefined;
}

/**
 * Bulk-assign conceptIds for every meaning in a language's lexicon
 * that doesn't have one yet. Called from `buildInitialState` so the
 * proto language has a complete UUID map; daughters inherit from
 * there.
 */
export function ensureConceptIdsForLexicon(lang: LexiconState): number {
  let assigned = 0;
  if (!lang.conceptIds) lang.conceptIds = {};
  for (const m of Object.keys(lang.lexicon)) {
    if (!lang.conceptIds[m]) {
      lang.conceptIds[m] = mintConceptId();
      assigned++;
    }
  }
  return assigned;
}
