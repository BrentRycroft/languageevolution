import type { Language, Meaning, WordForm } from "../types";
import { closedClassForm } from "../translator/closedClass";

/**
 * Phase 26b: derived view of a verb's citation form (infinitive).
 *
 * The simulator stores `lang.lexicon[verbMeaning]` as the BARE root —
 * essential for inflection (the inflection pipeline expects to apply
 * tense/person affixes to the bare stem). The infinitive is therefore
 * a derived view, computed on demand for display + non-finite contexts.
 *
 * Real-world strategies modeled:
 *   - English / Norwegian: "to V" particle prefix.
 *   - Latin / Spanish / French / Italian / Portuguese: -r/-re/-er/-ir
 *     affix suffix.
 *   - Old Germanic / Modern German: -an / -en affix suffix.
 *   - Polysynthetic / radically isolating: bare (no marker).
 *
 * Returns either:
 *   - `{ kind: "single"; form }` — a single-token citation form (bare
 *     or affix-marked).
 *   - `{ kind: "multi"; particle; root }` — two tokens, e.g. `to go`.
 *
 * Callers that just want a flat string can use `flattenCitation()`
 * below, which joins the parts with a space for the multi-token case.
 */
export type VerbCitation =
  | { kind: "single"; form: WordForm }
  | { kind: "multi"; particle: WordForm; root: WordForm };

export function verbCitationForm(
  lang: Language,
  meaning: Meaning,
): VerbCitation | null {
  const root = lang.lexicon[meaning];
  if (!root || root.length === 0) return null;
  const strat = lang.infinitiveStrategy ?? { kind: "bare" as const };

  switch (strat.kind) {
    case "bare":
      return { kind: "single", form: root.slice() };

    case "particle-prefix": {
      const particle = resolveParticle(lang, strat.particle ?? "to");
      if (!particle) return { kind: "single", form: root.slice() };
      return { kind: "multi", particle, root: root.slice() };
    }

    case "particle-suffix": {
      const particle = resolveParticle(lang, strat.particle ?? "to");
      if (!particle) return { kind: "single", form: root.slice() };
      return { kind: "multi", particle, root: root.slice() };
    }

    case "affix-prefix": {
      const affix = strat.affix ?? [];
      return { kind: "single", form: [...affix, ...root] };
    }

    case "affix-suffix": {
      const affix = strat.affix ?? [];
      return { kind: "single", form: [...root, ...affix] };
    }
  }
}

/**
 * Convenience: flatten a citation to a single space-separated string.
 * Used by display contexts that want a printable infinitive without
 * caring about token structure.
 */
export function flattenCitation(citation: VerbCitation): WordForm[] {
  if (citation.kind === "single") return [citation.form];
  return [citation.particle, citation.root];
}

/**
 * Resolve the particle's phonological form. Phase 26b: leverage the
 * existing closed-class machinery — particles like "to" / "of" / "for"
 * are already synthesised deterministically per language by closedClass.ts,
 * with optional `lang.lexicon[lemma]` overrides.
 */
function resolveParticle(lang: Language, lemma: string): WordForm | null {
  if (lang.lexicon[lemma]) return lang.lexicon[lemma]!.slice();
  return closedClassForm(lang, lemma) ?? null;
}
