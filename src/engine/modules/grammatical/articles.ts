/**
 * Phase 42b: articles module.
 *
 * Owns: `Language.grammar.articlePresence`.
 *
 * Realiser: emits/fuses `the`/`a` tokens per strategy
 *   - "free": separate DET token before/after head
 *   - "enclitic": appended to head form
 *   - "proclitic": prepended to head form
 *   - "prefix-merged" / "suffix-merged": fused into head, no
 *     separate token emitted
 *   - "none": skip
 * Currently legacy in realise.ts:325-371 (DET emission) and
 * sentence.ts:856-883 (fragment-mode DET handling).
 *
 * Step: `maybeArticleEmergence` — tier-scaled grammaticalisation
 * pathway (Phase 33i, currently morphology/evolve.ts:189-225).
 * "that" demonstrative grammaticalises into the definite article.
 * Once-per-language event; the module guards against re-entrancy.
 */

import { registerModule } from "../registry";
import type { SimulationModule } from "../types";

interface ArticlesState {
  // Generation when articles emerged; -1 = never emerged.
  emergedAt: number;
}

const articlesModule: SimulationModule<ArticlesState> = {
  id: "grammatical:articles",
  kind: "grammatical",
  initState(lang) {
    return {
      emergedAt: lang.grammar.articlePresence !== "none" ? 0 : -1,
    };
  },
  realiseStage: "realise-subject",
  realise(input) {
    // Phase 42b: stub. Legacy realise.ts:325-371 + sentence.ts:856-883
    // handle DET emission. Will absorb in Phase 46a.
    return input;
  },
  step(_lang, _state, _ctx) {
    // Phase 42b: stub. maybeArticleEmergence in morphology/evolve.ts
    // continues to fire from steps/grammar.ts. Will move here in
    // Phase 46a.
  },
};

export function registerArticlesModule(): void {
  registerModule(articlesModule);
}
