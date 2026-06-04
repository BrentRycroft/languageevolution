import type {
  Language,
  Meaning,
  MorphemeEntry,
  MorphemeInventory,
} from "../types";
import { lexGet } from "../lexicon/access";
import { recordedParts } from "../lexicon/word";

/**
 * morphemeInventory.ts
 *
 * Lane D (morphology encoding): a first-class, per-language MORPHEME
 * INVENTORY. Roots and bound affixes become queryable entries
 * `{form, meaning, category, productivity}` so a word's decomposition is
 * read from RECORDS — the recorded compound/derivation parts resolve to
 * inventory entries — instead of being re-parsed from the English gloss
 * string.
 *
 * The inventory is a DERIVED view. It is rebuilt (not hand-mutated) from
 * the authoritative records that already exist:
 *   - `lang.boundMorphemes`        → the bound affixes (category "affix")
 *   - `lang.derivationalSuffixes`  → affix position + productivity signal
 *   - `lang.compounds[m].parts`    → the roots used to build complex words
 * plus any content lexeme that is itself a constituent of some recorded
 * compound (so a word can reference its constituents as real entries).
 *
 * Build it AFTER the seed lexicon + compound/derivation records exist
 * (`steps/init.ts`), and rebuild it after structural change if a consumer
 * needs an up-to-date view. Forms are copied from `lang.lexicon` at build
 * time, so a stale inventory is refreshed by re-running `buildMorphemeInventory`.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

/**
 * Build (or rebuild) the morpheme inventory for a language from its
 * recorded structure. Pure with respect to everything except the
 * returned object — it reads records and the lexicon, and does not mutate
 * the language. Assign the result to `lang.morphemeInventory`.
 */
export function buildMorphemeInventory(lang: Language): MorphemeInventory {
  const entries: Record<Meaning, MorphemeEntry> = {};

  // 1. Bound affixes — the first-class affix lexicon. Position +
  //    productivity come from derivationalSuffixes when registered;
  //    pre-seed bound morphemes default to suffix / productive.
  const suffixByTag = new Map(
    (lang.derivationalSuffixes ?? []).map((s) => [s.tag, s]),
  );
  if (lang.boundMorphemes) {
    for (const affix of lang.boundMorphemes) {
      const form = lexGet(lang, affix);
      if (!form || form.length === 0) continue;
      const meta = suffixByTag.get(affix);
      const position: "prefix" | "suffix" =
        meta?.position
        ?? (affix.endsWith("-") && !affix.startsWith("-") ? "prefix" : "suffix");
      entries[affix] = {
        meaning: affix,
        form: form.slice(),
        category: "affix",
        position,
        productivity: meta?.productive ? 1 : 0,
      };
    }
  }

  // 2. Roots — every content lexeme that is a recorded constituent of a
  //    compound/derivation (the parts that aren't bound morphemes). These
  //    are the building blocks a word references. A root is always
  //    available to compose, so productivity defaults to 1.
  if (lang.compounds) {
    for (const meaning of Object.keys(lang.compounds)) {
      const parts = recordedParts(lang, meaning);
      if (!parts) continue;
      for (const part of parts) {
        if (entries[part]) continue; // already an affix or root entry
        const form = lexGet(lang, part);
        if (!form || form.length === 0) continue;
        entries[part] = {
          meaning: part,
          form: form.slice(),
          category: "root",
          productivity: 1,
        };
      }
    }
  }

  return { entries };
}

/**
 * Look up one morpheme inventory entry by its meaning key. Returns
 * undefined when the language has no inventory yet or the morpheme isn't
 * a recorded constituent.
 */
export function morphemeEntry(
  lang: Language,
  meaning: Meaning,
): MorphemeEntry | undefined {
  return lang.morphemeInventory?.entries[meaning];
}

/**
 * Lane D (morphology encoding): decompose a word into its constituent
 * morpheme-inventory entries, read from RECORDS (`lang.compounds[m].parts`
 * via `recordedParts`) — never from the gloss string. Returns the ordered
 * list of entries, or null when the meaning has no recorded structure.
 *
 * Each part must resolve to an inventory entry; if any part is missing
 * (e.g. a constituent was deleted, or the inventory is stale relative to
 * the records) the decomposition returns null rather than a partial list,
 * so callers can fall back cleanly.
 */
export function decomposeWord(
  lang: Language,
  meaning: Meaning,
): MorphemeEntry[] | null {
  const inventory = lang.morphemeInventory;
  if (!inventory) return null;
  const parts = recordedParts(lang, meaning);
  if (!parts) return null;
  const out: MorphemeEntry[] = [];
  for (const part of parts) {
    const entry = inventory.entries[part];
    if (!entry) return null;
    out.push(entry);
  }
  return out;
}
