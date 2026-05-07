import type { Language, Meaning, WordForm } from "../types";
import { CONCEPTS } from "../lexicon/concepts";

/**
 * Phase 51 T2: English → abstract concept → target-language pivot.
 *
 * The user's mental model: the translator validates input as English,
 * maps to an abstract concept (cluster + POS), then realises into the
 * target language. Pre-Phase-51 a concept-cousin rung existed but
 * fired AFTER the synthesis rungs — meaning a language with `mother`
 * but not `mom` would coin a fresh form for `mom` rather than reusing
 * `mother` (same cluster + pos).
 *
 * `attemptAbstractPivot` formalises the rung and gets called BEFORE
 * synth-affix / synth-concept / synth-cluster / synth-fallback. The
 * net effect: when the target language has a related lexicalisation
 * for the same concept, the translator picks it instead of inventing
 * a new form. The synth path becomes the genuine last-resort.
 *
 * Returns null when:
 *   - The lemma isn't in CONCEPTS (the bridge can't operate without
 *     metadata).
 *   - The target language has no semantically-adjacent meaning in its
 *     lexicon.
 *
 * The `frequencyClass` gate (basic / common only) means the abstract
 * pivot only fires for common words. Rare lemmas still take the synth
 * path so target-language vocabularies don't collapse onto a single
 * cluster representative.
 */

const PIVOT_ELIGIBLE_FREQ = new Set(["basic", "common"]);

export interface AbstractPivotResult {
  form: WordForm;
  via: Meaning;
  glossNote: string;
}

export function attemptAbstractPivot(
  lang: Language,
  lemma: string,
): AbstractPivotResult | null {
  const concept = CONCEPTS[lemma];
  if (!concept) return null;
  if (!PIVOT_ELIGIBLE_FREQ.has(concept.frequencyClass)) return null;

  // Direct hit — already handled at Rung 1 of resolveLemma, but guard
  // defensively in case this is called on an unsanitised path.
  if (lang.lexicon[lemma]) {
    return {
      form: lang.lexicon[lemma]!.slice(),
      via: lemma,
      glossNote: "",
    };
  }

  // Iterate registered colex partners first — they're explicitly
  // marked semantic neighbours.
  if (concept.colexWith) {
    for (const partner of concept.colexWith) {
      if (lang.lexicon[partner]) {
        return {
          form: lang.lexicon[partner]!.slice(),
          via: partner,
          glossNote: `↔ ${partner}`,
        };
      }
    }
  }

  // Same cluster + same POS, prefer ≤ same frequency class.
  let bestMatch: Meaning | null = null;
  for (const otherId of Object.keys(lang.lexicon)) {
    const otherConcept = CONCEPTS[otherId];
    if (!otherConcept) continue;
    if (otherConcept.cluster !== concept.cluster) continue;
    if (otherConcept.pos !== concept.pos) continue;
    bestMatch = otherId;
    break;
  }
  if (bestMatch) {
    return {
      form: lang.lexicon[bestMatch]!.slice(),
      via: bestMatch,
      glossNote: `* ${bestMatch}`,
    };
  }
  return null;
}
