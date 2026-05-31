import type { Lexicon, Meaning } from "../types";
import type { LexiconState } from "../domains";
import { fnv1a } from "../rng";

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

/**
 * B1 (Stage B meaning re-key) — the CANONICAL lexicon iteration order.
 *
 * Several RNG-coupled sites (sound-change application in apply.ts, name
 * generation in naming.ts) iterate the lexicon and draw from the shared
 * per-language Rng PER WORD, so a word's draw POSITION depends on its rank
 * in this order. Today that order is the sorted English-gloss keys. When
 * Stage B re-keys the lexicon to ConceptId (which sorts differently),
 * iterating raw ConceptIds would change the draw order and therefore every
 * evolved form. Centralising the order HERE means the re-key only has to
 * preserve THIS function's output: B2 reimplements it to return ConceptIds
 * ordered by their gloss — byte-for-byte the same sequence as today — and
 * callers stay agnostic. See STAGE-B-PLAN.md §3.
 */
export function orderedLexiconKeys(lexicon: Lexicon): Meaning[] {
  return Object.keys(lexicon).sort();
}

/**
 * Mint a fresh ConceptId for `lang`. Format:
 * `c_<8-hex>_<langId>_<seq>` where `seq` is a per-language monotonic
 * counter (`lang.conceptIdSeq`).
 *
 * Determinism: the id is a pure function of `(lang.id, seq)` and the
 * seq advances in deterministic mint order, so two runs of the same
 * config produce identical ConceptIds. The previous implementation
 * drew from a MODULE-GLOBAL counter, which made ids depend on
 * process-wide mint order — two sims in one process (or a run
 * regenerated from a share link) got different ids for the same
 * meaning even though the linguistic trajectory was identical.
 *
 * Uniqueness: embedding `langId` namespaces every language's mints,
 * so the `_<seq>` suffix only needs to be unique WITHIN a language —
 * which a per-language counter guarantees. Sister daughters that
 * independently coin the same meaning get distinct ids (distinct
 * `langId`), exactly as before. The new format also carries an extra
 * `_<langId>` segment the old format lacked, so new ids can never
 * collide with old-format ids inherited from a pre-existing save —
 * no migration is required.
 *
 * No RNG is consumed, so minting never perturbs the simulation's
 * random stream.
 */
export function mintConceptId(lang: { id: string; conceptIdSeq?: number }): ConceptId {
  const seq = (lang.conceptIdSeq = (lang.conceptIdSeq ?? 0) + 1);
  const h = fnv1a(`${lang.id}:${seq}`).toString(16).padStart(8, "0");
  return `c_${h}_${lang.id}_${seq}` as ConceptId;
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
  const id = mintConceptId(lang);
  lang.conceptIds[meaning] = id;
  return id;
}

/**
 * Reverse lookup: find the meaning string currently bound to a given
 * ConceptId. Returns undefined if the language has no record of the
 * concept. Useful for reconstruction probes that walk meaningHistory
 * back to a parent's lexicon by UUID.
 *
 * Phase 72 code-review fix A6: O(1) via a WeakMap-backed reverse
 * index. Pre-fix this was an O(n) scan of lang.conceptIds; on
 * reconstruction probes that walk many meanings per language across
 * many languages, the scan compounded. The reverse index is keyed on
 * the lang reference (WeakMap-safe) and invalidated lazily — if the
 * forward map's entry count changes, the reverse index is rebuilt.
 *
 * Caveat: the size-based staleness check assumes monotonic add/delete
 * — no callers re-WRITE an existing meaning's UUID (UUIDs are mint-
 * once-and-stable). If a future caller mutates conceptIds[m] in place
 * with a different ConceptId, the reverse index won't notice. None
 * of the current callers do this; if that changes, add a version
 * counter alongside size.
 */
const reverseIndex = new WeakMap<LexiconState, { size: number; map: Map<ConceptId, Meaning> }>();

function getReverseIndex(lang: LexiconState): Map<ConceptId, Meaning> | undefined {
  if (!lang.conceptIds) return undefined;
  const cached = reverseIndex.get(lang);
  const currentSize = Object.keys(lang.conceptIds).length;
  if (cached && cached.size === currentSize) return cached.map;
  // (Re)build. Triggered on first read OR when entry count changed
  // (new mint or deleteMeaning purge).
  const map = new Map<ConceptId, Meaning>();
  for (const m of Object.keys(lang.conceptIds)) {
    map.set(lang.conceptIds[m] as ConceptId, m);
  }
  reverseIndex.set(lang, { size: currentSize, map });
  return map;
}

export function meaningForConceptId(
  lang: LexiconState,
  conceptId: ConceptId,
): Meaning | undefined {
  const idx = getReverseIndex(lang);
  return idx?.get(conceptId);
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
      lang.conceptIds[m] = mintConceptId(lang);
      assigned++;
    }
  }
  return assigned;
}
