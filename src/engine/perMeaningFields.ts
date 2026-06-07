import type { Language, Meaning } from "./types";

/**
 * perMeaningFields.ts — Phase 72d T1.
 *
 * Central registry of per-meaning fields on Language. Each field has
 * declared lifecycle handlers:
 *
 *   - inherit (optional): clone strategy when a daughter language is
 *     created at tree-split time. Default is shallow-copy of object.
 *   - purgeOnDelete (optional): drop the meaning's entry when
 *     `deleteMeaning(lang, meaning)` runs.
 *
 * Pre-72d, adding a new per-meaning field required manually updating:
 *   - `src/engine/tree/split.ts` (clone for daughter)
 *   - `src/engine/lexicon/mutate.ts:deleteMeaning` (purge metadata)
 *   - `src/engine/contact/borrow.ts` (decide if borrowed entries get assigned)
 *   - `src/engine/persistence/migrate.ts` (schema migration)
 *
 * The audit (Theme E) flagged this as an unenforced manual checklist —
 * Phase 64+ added inflectionClass / nounDeclensionClass /
 * ablautClassAssignment / grammaticalizationStage and the inheritance
 * was missing from `tree/split.ts` for one phase per field. This
 * registry consolidates the handlers in one place; future fields are
 * enforced by appending to this list, and the helpers below derive
 * the correct behaviour automatically.
 *
 * NOTE: this registry intentionally only covers PER-MEANING fields
 * (Record<Meaning, X> shape). Whole-language fields (grammar,
 * phonemeInventory, conservatism, etc.) have bespoke handlers in
 * tree/split.ts:makeChild. Those have a different lifecycle and
 * shouldn't be in this registry.
 */

interface PerMeaningFieldSpec {
  /** The field name on Language (must be a per-meaning `Record<Meaning, X>`). */
  key: keyof Language;
  /** How to inherit the parent's entries when a daughter is created. */
  inherit: "shallow-clone" | "deep-clone-entries";
  /** Whether to delete `lang[key][meaning]` on `deleteMeaning(lang, meaning)`. */
  purgeOnDelete: boolean;
  /** Key space of this map. Satellite maps re-keyed in S2a are "lexemeId"; the
   *  lexemeIds index stays "gloss". Drives purge key resolution. */
  keyedBy: "gloss" | "lexemeId";
  /** Optional human-readable description for diagnostics. */
  description?: string;
}

// Phase 72 methodological audit Batch E: nested-shape fields (e.g.
// `perWordDiffusion: Record<ruleId, Record<meaning, gen>>`) live OUTSIDE
// the registry with dedicated helpers (see
// `purgePerWordDiffusionForMeaning`). The generic registry handles
// only flat `Record<Meaning, X>` fields. Pre-fix, the spec had a
// `shape?: "flat" | "nested"` discriminator and an `"inherit": "skip"`
// strategy — both declared but never read by any helper and never set
// by any registry entry. Deleted as speculative future-proofing
// (CLAUDE.md guideline 2: no flexibility that wasn't requested).

/**
 * Per-meaning fields. Add new fields here; the registry helpers below
 * will pick them up automatically.
 */
export const PER_MEANING_FIELDS: ReadonlyArray<PerMeaningFieldSpec> = [
  // Core lexicon (handled bespoke in tree/split.ts; included here for
  // documentation / completeness — purgeOnDelete is bespoke too).
  // We intentionally OMIT "lexicon" because its delete is part of
  // deleteMeaning's bespoke flow and inheritance is via cloneLexicon.

  {
    key: "wordFrequencyHints",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    keyedBy: "lexemeId",
    description: "Per-meaning frequency seed (Phase 24)",
  },
  {
    key: "lastChangeGeneration",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Per-meaning age tracker for sound-change diffusion",
  },
  {
    key: "wordOrigin",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Per-meaning provenance string (Phase 21)",
  },
  {
    key: "localNeighbors",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Per-meaning neighbour list for diffusion momentum",
  },
  {
    key: "registerOf",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Per-meaning register tag (high/low/neutral)",
  },
  {
    key: "variants",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Per-meaning form variants (alt forms competing with primary)",
  },
  {
    key: "wordOriginChain",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Etymology trace chain",
  },
  {
    key: "colexifiedAs",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Per-meaning colexification list",
  },
  // Phase 64 fields
  {
    key: "inflectionClass",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Phase 29 Tranche 5e inflection class assignment",
  },
  {
    key: "nounDeclensionClass",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Phase 64 T1 noun declension class",
  },
  {
    key: "ablautClassAssignment",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Phase 64 T2 ablaut class assignment",
  },
  {
    key: "grammaticalizationStage",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Phase 66 T1 grammaticalization stage tracking",
  },
  // Phase 71 / 72
  {
    key: "suppletion",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Phase 70 suppletion table; purged on delete by Phase 71b",
  },
  // Phase 72d (full-delivery defer-2): stable concept-identity UUIDs.
  // Inherited shallow-clone (the value is a plain string per meaning;
  // sister daughters share the same UUID for the same proto-meaning,
  // which is the cross-tree anchor reverse inference relies on).
  // PURGED on delete: when a meaning is dropped, its UUID record is
  // removed from lexemeIds — meaningHistory holds the trace instead.
  {
    key: "lexemeIds",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Phase 72d concept UUID anchors per meaning",
  },
  // Track A plan 7: glided meaning positions (number[] per meaning).
  // Deep-clone-entries so daughters get independent copies of each
  // position array (they diverge from the same ancestor point once
  // they drift independently). Purged on meaning delete so stale
  // glided positions don't accumulate for retired meanings.
  {
    key: "meaningPoints",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    keyedBy: "gloss",
    description: "Track A plan 7 glided meaning positions (plan 7)",
  },
  // Track C: engine-inert etymological ancestry (Record<Meaning, Meaning[]>).
  // Deep-clone-entries so daughters get independent part arrays; purged on
  // meaning delete so stale ancestry doesn't accumulate for retired meanings.
  {
    key: "etymology",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    keyedBy: "lexemeId",
    description: "Track C preset-morphemization etymological ancestry (display-only)",
  },
];

/**
 * Phase 72f T5: per-(rule, meaning) diffusion timestamps. Stored as
 * Record<ruleId, Record<meaning, generation>> — i.e., the OUTER key is
 * the ruleId, not the meaning. The standard `purgeMeaningFromRegistry`
 * helper can't navigate the nested structure, so we have a dedicated
 * purge pass for this field.
 */
export function purgePerWordDiffusionForMeaning(
  lang: Language,
  meaning: Meaning,
): number {
  if (!lang.perWordDiffusion) return 0;
  let count = 0;
  for (const ruleId of Object.keys(lang.perWordDiffusion)) {
    const inner = lang.perWordDiffusion[ruleId]!;
    if (inner[meaning] !== undefined) {
      delete inner[meaning];
      count++;
    }
  }
  return count;
}

/**
 * Phase 72d-1 (full-delivery defer-1b): registry-driven inheritance
 * helper. Replaces the manual clone-per-field pattern in
 * `tree/split.ts:makeChild` for all PER-MEANING fields. Each spec's
 * `inherit` strategy drives the clone:
 *
 *   - "shallow-clone": `{ ...parent[key] }` — copies the top-level
 *     map but shares value references.
 *   - "deep-clone-entries": `{ ...parent[key] }` for the outer map
 *     and `[...inner]` / `{ ...inner }` for each value (one level
 *     deeper). Used when the values are arrays/objects that the
 *     daughter shouldn't mutate through the shared reference.
 *
 * Whole-language fields (grammar, phonemeInventory, conservatism, etc.)
 * are still bespoke in `tree/split.ts:makeChild` — they're not
 * per-meaning records and have different cloning semantics.
 *
 * Returns the count of fields cloned.
 */
/**
 * Phase 72 code-review fix B12: an "empty container" is `{}` (plain
 * object with no own keys) or `[]` (zero-length array). Other values
 * — `null`, primitives, non-empty objects/arrays, Sets/Maps — are
 * considered populated. Sets/Maps are treated as populated even when
 * empty because their identity carries intent (the closedClassInventory
 * Set, for example, is shared by reference).
 */
function isEmptyContainer(v: unknown): boolean {
  if (v === null) return false;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    if (v instanceof Set || v instanceof Map) return false;
    return Object.keys(v as object).length === 0;
  }
  return false;
}

export function inheritMeaningFields(
  parentLang: Language,
  childLang: Language,
): number {
  const parentAsRecord = parentLang as unknown as Record<string, unknown>;
  const childAsRecord = childLang as unknown as Record<string, unknown>;
  let count = 0;
  for (const spec of PER_MEANING_FIELDS) {
    // Safety-net semantics: only fill fields that the bespoke caller
    // (e.g., tree/split.ts:makeChild) didn't populate. This means
    // adding a new per-meaning field to PER_MEANING_FIELDS is enough
    // to get inheritance — no tree/split.ts edit required — while
    // existing manual clones (which often do field-specific deep
    // copies the registry can't replicate) keep their semantics.
    //
    // Phase 72 code-review fix B12: treat an EMPTY map/array on the
    // child as "not populated" so a defensively-initialised `{}` or
    // `[]` still triggers parent-clone. Pre-B12 only `undefined`
    // skipped inheritance; a child with `{}` retained its empty
    // map and orphaned all parent entries.
    const childVal = childAsRecord[spec.key];
    if (childVal !== undefined && !isEmptyContainer(childVal)) continue;
    const parentVal = parentAsRecord[spec.key];
    if (parentVal === undefined) continue;
    if (spec.inherit === "shallow-clone") {
      childAsRecord[spec.key] = { ...(parentVal as Record<string, unknown>) };
      count++;
      continue;
    }
    if (spec.inherit === "deep-clone-entries") {
      const out: Record<string, unknown> = {};
      const src = parentVal as Record<string, unknown>;
      for (const k of Object.keys(src)) {
        const v = src[k];
        if (Array.isArray(v)) out[k] = [...v];
        else if (v && typeof v === "object") out[k] = { ...(v as object) };
        else out[k] = v;
      }
      childAsRecord[spec.key] = out;
      count++;
    }
  }
  return count;
}

/**
 * Helper: purge a meaning from every registered per-meaning field.
 * Call this from `deleteMeaning` (lexicon/mutate.ts) instead of the
 * hand-coded delete chain. Returns the count of fields that had the
 * meaning (informational; can be ignored).
 */
export function purgeMeaningFromRegistry(lang: Language, meaning: Meaning): number {
  let count = 0;
  const langAsRecord = lang as unknown as Record<string, Record<string, unknown> | undefined>;
  for (const spec of PER_MEANING_FIELDS) {
    if (!spec.purgeOnDelete) continue;
    const map = langAsRecord[spec.key];
    if (!map) continue;
    // Mint-free key resolution (mirrors the satellite seam, which never mints):
    // a "lexemeId" field is addressed by the meaning's existing id, falling back
    // to the gloss when no id has been minted (the seam stores such entries
    // gloss-keyed too). A "gloss" field is addressed by the gloss.
    const key =
      spec.keyedBy === "lexemeId"
        ? (lang.lexemeIds?.[meaning] ?? (meaning as string))
        : (meaning as string);
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      delete map[key];
      count++;
    }
  }
  return count;
}

/**
 * Sanity check: every per-meaning field declared on Language MUST be
 * in the registry OR explicitly opted out via the bespoke list. Keeps
 * the registry honest. Called from a unit test.
 *
 * The bespoke list covers fields that have non-standard lifecycle
 * handling (e.g., `lexicon` itself, which is the meaning's primary
 * form and treated specially everywhere).
 */
export const BESPOKE_PER_MEANING_FIELDS: ReadonlySet<string> = new Set([
  "lexicon", // primary form; bespoke handling
  "words", // form-keyed table; rebuilt from lexicon
  "wordsByFormKey", // index; rebuilt
  "altForms", // synonym tracker; bespoke addSynonym/removeSynonym
  "altRegister", // parallel to altForms
  "borrowHistory", // contact-driven; bespoke
  "compounds", // compound metadata; bespoke
  "diffusionState", // per-rule, not per-meaning
]);
