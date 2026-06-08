import type { Language, Meaning, WordForm } from "../types";
import { CONCEPTS } from "../lexicon/concepts";
import { lexFormById, lexHasById, lexIds, idForGloss } from "../lexicon/access";
import { meaningForLexemeId } from "../lexicon/lexemeIdentity";

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
  const lemmaId = idForGloss(lang, lemma);
  if (lemmaId !== undefined && lexHasById(lang, lemmaId)) {
    return {
      form: lexFormById(lang, lemmaId)!.slice(),
      via: lemma,
      glossNote: "",
    };
  }

  // Iterate registered colex partners first — they're explicitly
  // marked semantic neighbours.
  if (concept.colexWith) {
    for (const partner of concept.colexWith) {
      const partnerId = idForGloss(lang, partner);
      if (partnerId !== undefined && lexHasById(lang, partnerId)) {
        return {
          form: lexFormById(lang, partnerId)!.slice(),
          via: partner,
          glossNote: `↔ ${partner}`,
        };
      }
    }
  }

  // Same cluster + same POS, prefer ≤ same frequency class.
  // lexIds returns insertion-order LexemeIds; resolve each to its gloss.
  let bestMatch: Meaning | null = null;
  let bestMatchId = null;
  for (const otherId of lexIds(lang)) {
    const otherGloss = meaningForLexemeId(lang, otherId);
    if (otherGloss === undefined) continue;
    const otherConcept = CONCEPTS[otherGloss];
    if (!otherConcept) continue;
    if (otherConcept.cluster !== concept.cluster) continue;
    if (otherConcept.pos !== concept.pos) continue;
    bestMatch = otherGloss;
    bestMatchId = otherId;
    break;
  }
  if (bestMatch && bestMatchId) {
    return {
      form: lexFormById(lang, bestMatchId)!.slice(),
      via: bestMatch,
      glossNote: `* ${bestMatch}`,
    };
  }
  return null;
}
