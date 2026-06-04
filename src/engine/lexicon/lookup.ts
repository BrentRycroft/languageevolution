import type { Language, Meaning, WordForm } from "../types";
import type { LemmaResolution, Aspect, Mood } from "../translator/syntax";
import type { MorphCategory } from "../morphology/types";
import { isRegisteredConcept, colexWith } from "./concepts";
import { attemptAbstractPivot } from "../translator/abstraction";
import { attemptGracefulFallback } from "../translator/gracefulFallback";
import { isValidEnglishLemma } from "../translator/englishWordlist";
import {
  attemptMorphologicalSynthesis,
  attemptConceptDecomposition,
  attemptClusterComposition,
} from "./synthesis";
import { lexGet, lexHas } from "./access";
import { nearestLexicalisedMeaning } from "../semantics/embeddings";

/**
 * Phase 52 T1: lexicon-lookup abstraction layer.
 *
 * `lookupForm(lang, meaning, context?)` is the canonical "what is the
 * form for this meaning in this language, given this context?" API.
 * Translator and narrative call this instead of reading
 * `lang.lexicon[m]` directly. The 8-rung resolution cascade
 * (direct → compound → abstract pivot → synthesis → colex → graceful
 * fallback) lives here; future paradigm-driven dispatch (infix,
 * template, etc.) will hook in at the form-application step without
 * call sites needing to change.
 *
 * Pre-Phase-52 the same logic lived inline in
 * `translator/sentence.ts:resolveLemma`. The body is preserved
 * verbatim; this is a pure refactor that gives every caller a single
 * abstraction surface.
 *
 * `LookupContext` carries hints (category, number, gender, etc.) that
 * will drive paradigm selection in T2 / T4. Today most rungs ignore
 * the context — direct hits, synthesis, fallback all work meaning-only.
 * Reserving the parameter now means callers can populate it ahead of
 * the dispatcher gaining context-sensitivity.
 */

export interface LookupContext {
  category?: MorphCategory;
  number?: "sg" | "pl" | "du";
  gender?: number;
  inflectionClass?: 1 | 2 | 3 | 4;
  person?: "1" | "2" | "3";
  voice?: "active" | "passive";
  aspect?: Aspect;
  mood?: Mood;
  /**
   * Phase 52 T4: when false, lookup skips the synth-fallback rung
   * (Rung 8). This is the right setting for read-only callers like
   * narrative composition and reverse-index construction — they want
   * "is this lexicalised?" and shouldn't side-effect a coinage event
   * just because they ran a lookup. Translator UI passes the default
   * (true) so user-typed lemmas DO get coined when missing.
   */
  allowFallbackCoinage?: boolean;
}

export interface LookupResult {
  form: WordForm | null;
  resolution: LemmaResolution;
  glossNote: string;
}

// Phase 50 T3: lemmas that should NOT trigger graceful-fallback
// coinage. Closed-class English function words; some target languages
// legitimately omit them (zero-copula, no auxiliaries, etc.) and the
// realise layer's isZeroCopula / drop-aux logic depends on
// resolveLemma returning null for them.
const FALLBACK_SKIP = new Set<string>([
  "am", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "having",
  "do", "does", "did", "doing",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
  "the", "a", "an",
]);

/**
 * Same lookup but returns the resolution kind so callers can render
 * differently (translator chips, narrative glossing, etc.).
 */
export function lookupFormWithResolution(
  lang: Language,
  meaning: Meaning,
  context?: LookupContext,
): LookupResult {
  const allowFallback = context?.allowFallbackCoinage ?? true;
  // Rung 1: direct lexicon hit.
  if (lexHas(lang, meaning)) {
    return {
      form: lexGet(lang, meaning)!.slice(),
      resolution: "direct",
      glossNote: "",
    };
  }
  // Rung 2 (Phase 39c): compound recomposition.
  if (lang.compounds && lang.compounds[meaning]) {
    const meta = lang.compounds[meaning]!;
    const parts: WordForm = [];
    let allFound = true;
    for (const partMeaning of meta.parts) {
      const f = lexGet(lang, partMeaning);
      if (!f || f.length === 0) {
        allFound = false;
        break;
      }
      parts.push(...f);
      if (meta.linker) parts.push(...meta.linker);
    }
    if (allFound && parts.length > 0) {
      return {
        form: parts,
        resolution: "direct",
        glossNote: `compound: ${meta.parts.join("+")}`,
      };
    }
  }
  // Rung 2b (Phase 73e): an explicitly recorded colexification (this language
  // has MERGED the absorbed meaning into `winner` — via seedColexification or
  // evolved drift/merge) resolves to the winner's form BEFORE synthesis. The
  // language has declared these concepts share one lexeme, so don't coin a
  // novel form for the absorbed sense. (The registry colexWith *tendency*
  // stays a later, weaker fallback at rung 7b.)
  if (lang.colexifiedAs) {
    for (const [winner, losers] of Object.entries(lang.colexifiedAs)) {
      if (losers.includes(meaning) && lexHas(lang, winner)) {
        return {
          form: lexGet(lang, winner)!.slice(),
          resolution: "reverse-colex",
          glossNote: `↔ ${winner}`,
        };
      }
    }
  }
  // Rung 3 (Phase 51 T2): abstract pivot — concept-cousin lookup
  // before synth. Lets a language with `mother` translate `mom` via
  // mother's form rather than coining a fresh one.
  const abstractPivot = attemptAbstractPivot(lang, meaning);
  if (abstractPivot) {
    return {
      form: abstractPivot.form,
      resolution: "fallback",
      glossNote: abstractPivot.glossNote,
    };
  }
  // Rung 4 (Phase 47 T1): non-negational morphological synthesis.
  // Phase 53 T5: when the lemma isn't in the lexicon AND the caller
  // permits writes, also register synonym variants — multiple
  // productive affixes in the same DerivationCategory produce
  // synonymous realisations (e.g. -ness + -ity).
  const allowSynonymRegistration =
    allowFallback && !lexHas(lang, meaning);
  const synthGen = lang.events?.at(-1)?.generation ?? 0;
  const synthNonNeg = attemptMorphologicalSynthesis(lang, meaning, "non-neg",
    allowSynonymRegistration
      ? { registerSynonyms: { generation: synthGen } }
      : {},
  );
  if (synthNonNeg) {
    return {
      form: synthNonNeg.form,
      resolution: synthNonNeg.resolution,
      glossNote: synthNonNeg.glossNote,
    };
  }
  // Rung 5 (Phase 47 T3): negational synthesis.
  const synthNeg = attemptMorphologicalSynthesis(lang, meaning, "neg",
    allowSynonymRegistration
      ? { registerSynonyms: { generation: synthGen } }
      : {},
  );
  if (synthNeg) {
    return {
      form: synthNeg.form,
      resolution: synthNeg.resolution,
      glossNote: synthNeg.glossNote,
    };
  }
  // Rung 6 (Phase 47 T6): cross-linguistic concept decomposition.
  const synthConcept = attemptConceptDecomposition(lang, meaning);
  if (synthConcept) {
    return {
      form: synthConcept.form,
      resolution: synthConcept.resolution,
      glossNote: synthConcept.glossNote,
    };
  }
  // Rung 7 (Phase 47 T9): cluster-emergent composition (small-lex only).
  const synthCluster = attemptClusterComposition(lang, meaning);
  if (synthCluster) {
    return {
      form: synthCluster.form,
      resolution: synthCluster.resolution,
      glossNote: synthCluster.glossNote,
    };
  }
  // Rung 7b: colex (registry-attested colexification tendency). The explicit
  // recorded colexification (lang.colexifiedAs) is handled earlier at rung 2b.
  if (isRegisteredConcept(meaning)) {
    for (const partner of colexWith(meaning)) {
      if (lexHas(lang, partner)) {
        return {
          form: lexGet(lang, partner)!.slice(),
          resolution: "colex",
          glossNote: `↔ ${partner}`,
        };
      }
    }
  }
  // Rung 7c (MEGA-overhaul, continuous meaning model): nearest-anchor grounding.
  // Before coining a brand-new form, reuse the semantically CLOSEST word the language
  // already has — cosine over the shipped distributional embedding. A missing concept
  // surfaces as the nearest real lexeme (river→water, glad→happy) instead of an invented
  // form, but only when something genuinely close exists (SEMANTIC_GROUNDING_THRESHOLD);
  // otherwise it falls through to coinage below. Gated behind `allowFallback` so read-only
  // callers keep their prior behaviour, and it only substitutes an EXISTING word (no write,
  // no coinage event). Resolution reuses "colex" (a related existing word); the `≈` gloss
  // note distinguishes an embedding-grounded stand-in from a recorded colexification.
  if (allowFallback && !FALLBACK_SKIP.has(meaning)) {
    const grounded = nearestLexicalisedMeaning(lang, meaning);
    if (grounded) {
      return {
        form: lexGet(lang, grounded.meaning)!.slice(),
        resolution: "colex",
        glossNote: `≈ ${grounded.meaning}`,
      };
    }
  }
  // Rung 8 (Phase 50 T3 + Phase 51 T1): graceful fallback — coin a
  // fresh form so the translator never returns a hard `?` on a
  // legitimate English lemma. Skip closed-class lemmas (zero-copula
  // languages drop them) and gibberish (Phase 51 T1 validation).
  if (allowFallback && !FALLBACK_SKIP.has(meaning) && isValidEnglishLemma(meaning)) {
    const fallbackGen = lang.events?.at(-1)?.generation ?? 0;
    const synthFallback = attemptGracefulFallback(lang, meaning, fallbackGen);
    if (synthFallback) {
      return {
        form: synthFallback.form.slice(),
        resolution: "synth-fallback",
        glossNote: synthFallback.glossNote,
      };
    }
  }
  return { form: null, resolution: "fallback", glossNote: "?" };
}

/**
 * Form-only lookup — drops the resolution metadata. For callers that
 * just need "the form for this meaning" without caring how it was
 * resolved (most narrative paths, sound-change application, etc.).
 */
export function lookupForm(
  lang: Language,
  meaning: Meaning,
  context?: LookupContext,
): WordForm | null {
  return lookupFormWithResolution(lang, meaning, context).form;
}

/**
 * Phase 55 T2: idiom + multi-word lookup. Given a phrase (token
 * list), return the language's lexicalised rendering if it stores
 * the phrase as a fixed idiom; null otherwise (caller falls through
 * to per-word translation).
 *
 * Phrases are normalised lower-case + space-joined for the key.
 * `kick the bucket` → key `"kick the bucket"`. Adjacent words match
 * the language's `idioms` map exactly.
 */
export function lookupIdiom(
  lang: Language,
  phrase: ReadonlyArray<Meaning>,
): WordForm | null {
  if (!lang.idioms) return null;
  if (phrase.length < 2) return null;
  const key = phrase.map((p) => p.toLowerCase()).join(" ");
  const entry = lang.idioms[key];
  if (!entry) return null;
  return entry.form.slice();
}
