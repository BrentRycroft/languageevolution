import type { Lexicon, Meaning, WordForm } from "../types";
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
 *       `Record<LexemeId, WordForm>`. Touches every preset,
 *       snapshot test, and persistence path. 1-2 weeks of dedicated
 *       migration; not feasible in one session.
 *
 *   (b) PRACTICAL (this commit): keep Lexicon string-keyed, but
 *       attach a per-language `conceptIds: Record<Meaning, LexemeId>`
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
 * The branded `LexemeId` type prevents accidental confusion with
 * `Meaning` (which is a structural alias for `string`). Use
 * `mintLexemeId()` to create new IDs and `lexemeIdFor(lang, m)`
 * to look up or lazily assign the ID for a meaning in a given
 * language.
 */

export type LexemeId = string & { readonly __brand: "LexemeId" };

/**
 * B1 (Stage B meaning re-key) — the CANONICAL lexicon iteration order.
 *
 * Several RNG-coupled sites (sound-change application in apply.ts, name
 * generation in naming.ts) iterate the lexicon and draw from the shared
 * per-language Rng PER WORD, so a word's draw POSITION depends on its rank
 * in this order. The contract is "ordered by GLOSS".
 *
 * R2 (concept re-key — the flip): `lang.lexicon` is now `Record<LexemeId,
 * WordForm>`. This function resolves each store key (a LexemeId) back to its
 * gloss and returns the GLOSSES sorted — byte-for-byte the same sequence as
 * the pre-flip `Object.keys(glossStore).sort()`. Gloss-consuming callers
 * (naming.ts, reverse.ts) stay agnostic. The RNG hot path (apply.ts) needs
 * the matching LexemeId sequence to index the store; it calls
 * `orderedLexemeIds` instead, which returns the SAME glosses' LexemeIds in
 * the SAME order. See docs/planning/CONCEPT-REKEY-PLAN.md.
 */
export function orderedLexiconKeys(lang: LexiconState): Meaning[] {
  const g = buildLexemeIdToGloss(lang);
  return Object.keys(lang.lexicon)
    .map((cid) => g.get(cid) ?? (cid as Meaning))
    .sort();
}

/**
 * Build a FRESH LexemeId → gloss map by inverting `lang.conceptIds` (the
 * gloss → LexemeId source of truth). O(n), ALWAYS correct.
 *
 * Hot/bulk cid→gloss resolution (apply.ts, lexKeys, lexEntries,
 * orderedLexiconKeys/orderedLexemeIds, the phonology ages loop) builds this
 * ONCE per scope and does O(1) `Map.get`s, instead of calling
 * `meaningForLexemeId` per key. That routes through the size-staleness-cached
 * reverse index, which is wrong for the hot path on BOTH axes: (a) it recomputes
 * `Object.keys(lang.conceptIds).length` per call → O(n²) per step (a ~6× perf
 * regression), and (b) its size check reads STALE when a delete and an add net
 * zero size change within one step → a LexemeId resolves to the wrong gloss →
 * a byte-identity break. A fresh inversion has neither failure mode.
 */
export function buildLexemeIdToGloss(lang: LexiconState): Map<string, Meaning> {
  const out = new Map<string, Meaning>();
  if (!lang.conceptIds) return out;
  for (const gloss of Object.keys(lang.conceptIds)) {
    out.set(lang.conceptIds[gloss] as string, gloss);
  }
  return out;
}

/**
 * The LexemeId store keys ordered by their GLOSS — the canonical RNG-draw
 * order, expressed as the physical keys the hot path uses to index the store.
 * `orderedLexemeIds(lexicon, lang)[i]` is the LexemeId whose gloss is at
 * position i of `orderedLexiconKeys(lang)`, so iterating it draws RNG in the
 * exact same per-word sequence as the pre-flip sorted-gloss iteration.
 *
 * Takes `lexicon` explicitly (not `lang.lexicon`) because the stratal hot path
 * applies changes to an intermediate store distinct from `lang.lexicon`; its
 * keys are the same LexemeIds, resolved against `lang`'s identity map.
 * Decorate-sort-undecorate: resolve each gloss once, sort by gloss.
 */
export function orderedLexemeIds(lexicon: Lexicon, lang: LexiconState): LexemeId[] {
  const g = buildLexemeIdToGloss(lang);
  return (Object.keys(lexicon) as LexemeId[])
    .map((cid) => [g.get(cid) ?? (cid as string), cid] as [string, LexemeId])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map((pair) => pair[1]);
}

/**
 * Mint a fresh LexemeId for `lang`. Format:
 * `c_<8-hex>_<langId>_<seq>` where `seq` is a per-language monotonic
 * counter (`lang.conceptIdSeq`).
 *
 * Determinism: the id is a pure function of `(lang.id, seq)` and the
 * seq advances in deterministic mint order, so two runs of the same
 * config produce identical LexemeIds. The previous implementation
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
export function mintLexemeId(lang: { id: string; conceptIdSeq?: number }): LexemeId {
  const seq = (lang.conceptIdSeq = (lang.conceptIdSeq ?? 0) + 1);
  const h = fnv1a(`${lang.id}:${seq}`).toString(16).padStart(8, "0");
  return `c_${h}_${lang.id}_${seq}` as LexemeId;
}

/**
 * Look up the LexemeId for a meaning, or lazily mint one. The
 * lazy-mint policy means existing code that calls `deleteMeaning`,
 * adds new meanings via `setLexiconForm`, etc. all continue to work
 * — the UUID is created on first reference.
 *
 * Daughter languages inherit conceptIds at split (tree/split.ts), so
 * sister leaves share the same UUID for the same proto-meaning. This
 * is the cross-tree anchor the audit's reconstruction probes need.
 */
export function lexemeIdFor(lang: LexiconState, meaning: Meaning): LexemeId {
  if (!lang.conceptIds) lang.conceptIds = {};
  const existing = lang.conceptIds[meaning];
  if (existing) return existing as LexemeId;
  const id = mintLexemeId(lang);
  lang.conceptIds[meaning] = id;
  return id;
}

/**
 * Reverse lookup: find the meaning string currently bound to a given
 * LexemeId. Returns undefined if the language has no record of the
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
 * with a different LexemeId, the reverse index won't notice. None
 * of the current callers do this; if that changes, add a version
 * counter alongside size.
 */
const reverseIndex = new WeakMap<LexiconState, { size: number; map: Map<LexemeId, Meaning> }>();

function getReverseIndex(lang: LexiconState): Map<LexemeId, Meaning> | undefined {
  if (!lang.conceptIds) return undefined;
  const cached = reverseIndex.get(lang);
  const currentSize = Object.keys(lang.conceptIds).length;
  if (cached && cached.size === currentSize) return cached.map;
  // (Re)build. Triggered on first read OR when entry count changed
  // (new mint or deleteMeaning purge).
  const map = new Map<LexemeId, Meaning>();
  for (const m of Object.keys(lang.conceptIds)) {
    map.set(lang.conceptIds[m] as LexemeId, m);
  }
  reverseIndex.set(lang, { size: currentSize, map });
  return map;
}

export function meaningForLexemeId(
  lang: LexiconState,
  conceptId: LexemeId,
): Meaning | undefined {
  const idx = getReverseIndex(lang);
  return idx?.get(conceptId);
}

/**
 * R2 (concept re-key — the flip): convert a GLOSS-keyed `lang.lexicon`
 * (`Record<Meaning, WordForm>`, as presets author it) into the canonical
 * LexemeId-keyed store (`Record<LexemeId, WordForm>`), populating
 * `lang.conceptIds` (gloss → LexemeId) along the way.
 *
 * Determinism: mints LexemeIds in `Object.keys(glossStore)` order — the
 * preset's insertion order, exactly the order the pre-flip
 * `ensureLexemeIdsForLexicon` used — and builds the new store in that same
 * order, so the cid store's INSERTION order positionally matches the old
 * gloss store's. Every insertion-order-sensitive site (`lexKeys`) therefore
 * yields the identical gloss sequence. Call ONCE, at language birth, on a
 * gloss-keyed store; calling it on an already-flipped store would mint bogus
 * ids.
 */
export function rekeyLexiconToLexemeIds(lang: LexiconState): void {
  if (!lang.conceptIds) lang.conceptIds = {};
  const glossStore = lang.lexicon as Record<string, WordForm>;
  const cidStore: Record<string, WordForm> = {};
  for (const gloss of Object.keys(glossStore)) {
    let cid = lang.conceptIds[gloss] as LexemeId | undefined;
    if (!cid) {
      cid = mintLexemeId(lang);
      lang.conceptIds[gloss] = cid;
    }
    cidStore[cid] = glossStore[gloss]!;
  }
  lang.lexicon = cidStore as Lexicon;
}

/**
 * Bulk-assign conceptIds for every meaning in a GLOSS-keyed lexicon that
 * doesn't have one yet. Retained for old-save migration and identity-map
 * tests; the live birth path uses `rekeyLexiconToLexemeIds` (which also
 * flips the physical store). Operates on gloss keys — do not call on a
 * LexemeId-keyed store.
 */
export function ensureLexemeIdsForLexicon(lang: LexiconState): number {
  let assigned = 0;
  if (!lang.conceptIds) lang.conceptIds = {};
  // Post-flip the canonical store is LexemeId-keyed: a store key that is
  // already a known LexemeId has intrinsic identity, so skip it (and never
  // mint a bogus id for it). Only un-identified GLOSS keys — an old gloss-keyed
  // save being migrated — get a fresh id. This keeps the helper idempotent on a
  // live (cid-keyed) lexicon and correct on a legacy (gloss-keyed) one.
  const knownCids = new Set<string>(Object.values(lang.conceptIds));
  for (const key of Object.keys(lang.lexicon)) {
    if (knownCids.has(key)) continue;
    if (!lang.conceptIds[key]) {
      lang.conceptIds[key] = mintLexemeId(lang);
      assigned++;
    }
  }
  return assigned;
}
