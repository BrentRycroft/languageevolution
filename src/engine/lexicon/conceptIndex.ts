import type { Language, Meaning } from "../types";
import type { LexemeId } from "./lexemeIdentity";
import { meaningForLexemeId, orderedLexemeIds } from "./lexemeIdentity";
import { idForGloss } from "./access";
import { satGet } from "./satellites";
import { currentPointForId } from "../semantics/meaningPoint";
import { glossOf } from "../semantics/anchors";
import { hasEmbedding } from "../semantics/embeddings";

/**
 * conceptIndex.ts (storage step-5 S6) — the GEOMETRIC concept→lexeme resolver.
 *
 * `idForConcept(lang, m)` returns the gloss-bearing lexeme whose EMERGENT gloss (nearest anchor of
 * its current/drifted point) is `m`, ties broken by sorted LexemeId (S5 order, first-wins). It falls
 * back to `idForGloss(lang, m)` when no record geometrically glosses to `m` (closed-class / non-anchor
 * / unlexicalised) — making it a SAFE SUPERSET of `idForGloss`: byte-identical for un-drifted words.
 * Display/translation use only; the engine's identity bookkeeping keeps `idForGloss`.
 */
const cache = new WeakMap<Language, Map<Meaning, LexemeId>>();

/** Emergent gloss of a gloss-bearing record at id level — mirrors `effectiveGloss(lang, sense)`. */
function emergentGlossForId(lang: Language, id: LexemeId, stored: Meaning): Meaning {
  const hasDrift = satGet(lang, "meaningPoints", id) !== undefined;
  return hasDrift || hasEmbedding(stored) ? glossOf(currentPointForId(lang, id)) : stored;
}

function buildConceptIndex(lang: Language): Map<Meaning, LexemeId> {
  const out = new Map<Meaning, LexemeId>();
  // Sorted-LexemeId order (S5): a concept with two equally-near lexemes resolves to the lowest id.
  for (const id of orderedLexemeIds(lang.lexemes)) {
    const stored = meaningForLexemeId(lang, id);
    if (stored === undefined) continue; // keyless — no gloss
    const eg = emergentGlossForId(lang, id, stored);
    if (!out.has(eg)) out.set(eg, id);
  }
  return out;
}

export function idForConcept(lang: Language, m: Meaning): LexemeId | undefined {
  let idx = cache.get(lang);
  if (!idx) {
    idx = buildConceptIndex(lang);
    cache.set(lang, idx);
  }
  return idx.get(m) ?? idForGloss(lang, m);
}

/** Invalidate the cache (mid-gen mutations; the per-gen lang rewrite auto-invalidates via WeakMap). */
export function invalidateConceptIndexCache(lang: Language): void {
  cache.delete(lang);
}
