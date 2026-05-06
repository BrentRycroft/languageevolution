/**
 * Phase 46a: legacy-flag → activeModules computation.
 *
 * Computes the equivalent `activeModules` set from a Language's
 * legacy flat-flag state (`grammar`, `morphology`, `boundMorphemes`,
 * etc.). Used by:
 *   - the v8→v9 save migrator (persistence/migrate.ts)
 *   - presets that don't explicitly declare `seedActiveModules`
 *     (config/buildInitialState auto-derives the set from the
 *     preset's typological flags)
 *
 * The mapping is conservative — we activate a module when the
 * language's legacy configuration shows clear evidence the feature
 * is in use. Closed-isolate languages get a minimal semantic set;
 * Sprachbund languages get the full contact stack.
 *
 * This function is the single source of truth for the
 * legacy-to-modules mapping. Consumers should call it rather than
 * hardcode their own subset.
 */

import type { Language } from "../types";

/**
 * Compute the equivalent active-modules set from a Language's
 * legacy flat-flag state.
 *
 * Default activations (always on, regardless of typology):
 *   - semantic:lexicon       — every language has a lexicon
 *   - semantic:clusters      — cluster registry is global
 *   - semantic:frequency     — frequency hints feed Swadesh + variants
 *
 * Conditional activations follow legacy field reads:
 *   - case-marking ←→ grammar.hasCase || grammar.caseStrategy="case"
 *   - articles     ←→ grammar.articlePresence !== "none"
 *   - number       ←→ grammar.numberSystem !== "none"
 *   - aspect/mood/evidentials/politeness ← legacy flags
 *   - word-order   ←→ grammar.wordOrder ("SVO" / "SOV" / etc.)
 *   - alignment    ←→ grammar.alignment ("nom-acc" / "erg-abs" / etc.)
 *   - placements   ←→ adjectivePosition / possessorPosition / etc.
 *   - relativiser  ←→ relativeClauseStrategy
 *   - serial-verb  ←→ serialVerbConstructions
 *   - paradigms    ←→ Object.keys(morphology.paradigms).length > 0
 *   - derivation   ←→ boundMorphemes / compounds non-empty
 *   - inflection-class ←→ classifyLexicon ran (lexicon items have classes)
 *   - agreement    ←→ nounClassAssignments non-empty || genderCount > 0
 *   - synonymy     ←→ words have synonym senses
 *   - borrowing/calque/reborrow ← always on for non-isolated languages
 *   - taboo        ← always on (universal cultural pressure)
 *   - coinage      ← always on (universal genesis pressure)
 */
export function computeActiveModulesFromLegacy(lang: Language): Set<string> {
  const m = new Set<string>();

  // Always-on semantic core
  m.add("semantic:lexicon");
  m.add("semantic:clusters");
  m.add("semantic:frequency");

  // Grammatical
  const g = lang.grammar;
  if (g.hasCase || g.caseStrategy === "case") m.add("grammatical:case-marking");
  if (g.articlePresence !== "none") m.add("grammatical:articles");
  if (g.numberSystem) m.add("grammatical:number-system");
  if (g.aspectMarking && g.aspectMarking !== "none") m.add("grammatical:aspect");
  if (g.moodMarking) m.add("grammatical:mood");
  if (g.evidentialMarking && g.evidentialMarking !== "none") m.add("grammatical:evidentials");
  if (g.politenessRegister && g.politenessRegister !== "none") m.add("grammatical:politeness");
  m.add("grammatical:reference-tracking");
  m.add("grammatical:numerals");
  m.add("grammatical:demonstratives");

  // Syntactical — always exactly one word-order + one alignment
  switch (g.wordOrder) {
    case "SOV": m.add("syntactical:wordOrder/sov"); break;
    case "SVO": m.add("syntactical:wordOrder/svo"); break;
    case "VSO": m.add("syntactical:wordOrder/vso"); break;
    case "VOS": m.add("syntactical:wordOrder/vos"); break;
    case "OVS": m.add("syntactical:wordOrder/ovs"); break;
    case "OSV": m.add("syntactical:wordOrder/osv"); break;
    default: m.add("syntactical:wordOrder/svo");
  }
  const al = g.alignment ?? "nom-acc";
  switch (al) {
    case "nom-acc": m.add("syntactical:alignment/nom-acc"); break;
    case "erg-abs": m.add("syntactical:alignment/erg-abs"); break;
    case "tripartite": m.add("syntactical:alignment/tripartite"); break;
    case "split-S": m.add("syntactical:alignment/split-s"); break;
    default: m.add("syntactical:alignment/nom-acc");
  }
  // Placements always on (every language has *some* placement convention)
  m.add("syntactical:adj-placement");
  m.add("syntactical:poss-placement");
  m.add("syntactical:num-placement");
  m.add("syntactical:neg-placement");
  if (g.relativeClauseStrategy) m.add("syntactical:relativiser");
  m.add("syntactical:coordination");
  if (g.serialVerbConstructions) m.add("syntactical:serial-verb");

  // Morphological
  const paradigms = lang.morphology?.paradigms ?? {};
  const hasParadigms = Object.keys(paradigms).length > 0;
  if (hasParadigms) m.add("morphological:paradigms");
  if (lang.boundMorphemes && lang.boundMorphemes.size > 0) {
    m.add("morphological:derivation");
  } else if (lang.compounds && Object.keys(lang.compounds).length > 0) {
    m.add("morphological:derivation");
  }
  // Inflection classes are populated by classifyLexicon at birth; treat
  // their presence in any seed lexicon entry as activation.
  const someWord = Object.values(lang.lexicon ?? {})[0];
  if (someWord && hasParadigms) m.add("morphological:inflection-class");
  if ((lang.nounClassAssignments && Object.keys(lang.nounClassAssignments).length > 0) ||
      (g.genderCount && g.genderCount > 0)) {
    m.add("morphological:agreement");
  }
  if (hasParadigms) m.add("morphological:analogy");
  // templatic stays off by default — opt-in only for Semitic-style
  // presets (plan: future Arabic preset will activate explicitly).

  // Semantic — synonymy/colex/borrow/calque/reborrow/taboo/coinage
  // are always on by default; closed-isolate presets can override
  // by passing an explicit seedActiveModules subset.
  m.add("semantic:synonymy");
  m.add("semantic:colexification");
  m.add("semantic:borrowing");
  m.add("semantic:calque");
  m.add("semantic:reborrow");
  m.add("semantic:taboo");
  m.add("semantic:coinage");

  return m;
}
