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
  /** The field name on Language (must be a per-meaning Record). */
  key: keyof Language;
  /** How to inherit the parent's entries when a daughter is created. */
  inherit: "shallow-clone" | "deep-clone-entries" | "skip";
  /** Whether to delete `lang[key][meaning]` on `deleteMeaning(lang, meaning)`. */
  purgeOnDelete: boolean;
  /** Optional human-readable description for diagnostics. */
  description?: string;
}

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
    description: "Per-meaning frequency seed (Phase 24)",
  },
  {
    key: "lastChangeGeneration",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    description: "Per-meaning age tracker for sound-change diffusion",
  },
  {
    key: "wordOrigin",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    description: "Per-meaning provenance string (Phase 21)",
  },
  {
    key: "localNeighbors",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    description: "Per-meaning neighbour list for diffusion momentum",
  },
  {
    key: "registerOf",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    description: "Per-meaning register tag (high/low/neutral)",
  },
  {
    key: "variants",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    description: "Per-meaning form variants (alt forms competing with primary)",
  },
  {
    key: "wordOriginChain",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    description: "Etymology trace chain",
  },
  {
    key: "colexifiedAs",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    description: "Per-meaning colexification list",
  },
  // Phase 64 fields
  {
    key: "inflectionClass",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    description: "Phase 29 Tranche 5e inflection class assignment",
  },
  {
    key: "nounDeclensionClass",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    description: "Phase 64 T1 noun declension class",
  },
  {
    key: "ablautClassAssignment",
    inherit: "shallow-clone",
    purgeOnDelete: true,
    description: "Phase 64 T2 ablaut class assignment",
  },
  {
    key: "grammaticalizationStage",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    description: "Phase 66 T1 grammaticalization stage tracking",
  },
  // Phase 71 / 72
  {
    key: "suppletion",
    inherit: "deep-clone-entries",
    purgeOnDelete: true,
    description: "Phase 70 suppletion table; purged on delete by Phase 71b",
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
 * Helper: purge a meaning from every registered per-meaning field.
 * Call this from `deleteMeaning` (lexicon/mutate.ts) instead of the
 * hand-coded delete chain. Returns the count of fields that had the
 * meaning (informational; can be ignored).
 */
export function purgeMeaningFromRegistry(lang: Language, meaning: Meaning): number {
  let count = 0;
  const key = meaning as string;
  // Cast to a generic record once to avoid per-field type narrowing.
  const langAsRecord = lang as unknown as Record<string, Record<string, unknown> | undefined>;
  for (const spec of PER_MEANING_FIELDS) {
    if (!spec.purgeOnDelete) continue;
    const map = langAsRecord[spec.key];
    if (map && Object.prototype.hasOwnProperty.call(map, key)) {
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
