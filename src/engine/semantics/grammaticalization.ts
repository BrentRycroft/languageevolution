import type {
  MorphCategory,
  GrammaticalisedAxes,
} from "../morphology/types";
import { toCategoryAxis } from "../morphology/types";
import type { GrammarFeatures, Language } from "../types";

/**
 * grammaticalization.ts
 *
 * Semantic drift, recarving (split / merge), bleaching, colexification, neighbour relations. Key exports: SemanticTag, SEMANTIC_TAG, PATHWAYS.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export type SemanticTag =
  | "motion"
  | "posture"
  | "existential"
  | "possession"
  | "body_core"
  | "body_periphery"
  | "quantifier"
  | "perception"
  | "life"
  | "deixis"
  | "interrogative"
  | "topic_noun"
  | "emphasis"
  | "desire"
  | "conditional"
  | "honorific";

export const SEMANTIC_TAG: Record<string, SemanticTag> = {
  go: "motion",
  come: "motion",
  walk: "motion",
  run: "motion",
  fly: "motion",
  swim: "motion",
  fall: "motion",
  sit: "posture",
  stand: "posture",
  lie: "posture",
  be: "existential",
  live: "existential",
  hold: "possession",
  take: "possession",
  give: "possession",
  carry: "possession",
  have: "possession",
  head: "body_core",
  hand: "body_core",
  heart: "body_core",
  eye: "body_core",
  face: "body_core",
  back: "body_core",
  belly: "body_core",
  mouth: "body_core",
  foot: "body_periphery",
  finger: "body_periphery",
  nail: "body_periphery",
  tail: "body_periphery",
  one: "quantifier",
  two: "quantifier",
  three: "quantifier",
  all: "quantifier",
  many: "quantifier",
  some: "quantifier",
  see: "perception",
  hear: "perception",
  know: "perception",
  say: "perception",
  speak: "perception",
  think: "perception",
  eat: "life",
  drink: "life",
  sleep: "life",
  die: "life",
  bear_child: "life",
  this: "deixis",
  that: "deixis",
  here: "deixis",
  there: "deixis",
  who: "interrogative",
  what: "interrogative",
  where: "interrogative",
  when: "interrogative",
  why: "interrogative",
  how: "interrogative",
  name: "topic_noun",
  word: "topic_noun",
  truth: "emphasis",
  want: "desire",
  hope: "desire",
  wish: "desire",
  if: "conditional",
  may: "conditional",
  might: "conditional",
  honor: "honorific",
  king: "honorific",
  elder: "honorific",
};

export const PATHWAYS: Record<SemanticTag, MorphCategory[]> = {
  motion: ["verb.tense.fut", "verb.aspect.prosp", "verb.aspect.pfv", "verb.aspect.ipfv"],
  posture: ["verb.aspect.ipfv", "verb.aspect.hab", "verb.aspect.pfv"],
  existential: ["verb.tense.past", "verb.aspect.perf", "verb.aspect.pfv"],
  possession: ["noun.case.gen", "noun.case.dat", "verb.aspect.perf", "verb.aspect.pfv"],
  body_core: ["noun.case.loc", "noun.case.dat", "noun.case.inst"],
  body_periphery: ["noun.case.loc", "noun.case.abl"],
  quantifier: ["noun.num.pl", "noun.num.du", "noun.num.pauc"],
  perception: ["verb.tense.past", "verb.aspect.pfv", "verb.evid.dir", "verb.evid.rep", "verb.evid.inf"],
  life: ["verb.aspect.pfv"],
  deixis: ["noun.case.nom"],
  interrogative: ["discourse.q"],
  topic_noun: ["discourse.topic"],
  emphasis: ["discourse.emph"],
  desire: ["verb.mood.opt"],
  conditional: ["verb.mood.cond"],
  honorific: ["verb.honor.formal"],
};

export function semanticTagOf(meaning: string): SemanticTag | undefined {
  return SEMANTIC_TAG[meaning];
}

export function pathwayTargets(tag: SemanticTag): MorphCategory[] {
  return PATHWAYS[tag] ?? [];
}

/**
 * Phase 73c Tier C Phase 1: filter pathway targets by a language's
 * declared `grammaticalisedAxes`. A target like `verb.tense.fut`
 * decomposes to `{axis: "tense", value: "fut"}`; if the language's
 * `grammaticalisedAxes.tense` is set and doesn't include "fut",
 * the target is skipped.
 *
 * Categories that don't decompose to one of the six Phase-1 axes
 * (person, number, nounClass, discourse, etc.) pass through
 * unchanged — they're not gated yet.
 *
 * When `grammaticalisedAxes` is absent, returns the pathway list
 * unchanged (legacy behaviour). This keeps Phase 1 strictly
 * additive: existing languages see no behaviour change until they
 * opt in to gating.
 */
export function pathwayTargetsForLang(
  tag: SemanticTag,
  lang: Pick<Language, "grammar">,
): MorphCategory[] {
  // Phase 5b: gate pathway targets on the language's grammaticalised axes,
  // DERIVED from its current typology when not explicitly declared. The gate
  // was opt-in and `grammaticalisedAxes` was never set anywhere, so isolating
  // languages (tenseMarking="none", hasCase=false) grew IE case/tense/mood from
  // the universal pathway map. Deriving on-demand from `grammar` makes the gate
  // always-on and follows each daughter's OWN typology with no construction
  // wiring — an isolating language whose grammar says tense:[]/case:[] can no
  // longer grammaticalise those axes (it stays isolating without a pathway).
  const axes = lang.grammar.grammaticalisedAxes ?? deriveGrammaticalisedAxes(lang.grammar);
  const targets = pathwayTargets(tag);
  return targets.filter((cat) => isCategoryAllowed(cat, axes));
}

function isCategoryAllowed(
  cat: MorphCategory,
  axes: GrammaticalisedAxes,
): boolean {
  const decomposed = toCategoryAxis(cat);
  if (!decomposed) return true; // unmapped axis — not gated
  const allowed = axes[decomposed.axis];
  if (!allowed) return true; // axis not declared — not gated
  return (allowed as ReadonlyArray<string>).includes(decomposed.value);
}

/**
 * Phase 73c Tier C Phase 1: derive `grammaticalisedAxes` from a
 * language's existing TAM / voice / case / alignment flags. The
 * conversion table mirrors the semantics of the legacy declarations:
 *
 *   tenseMarking: "past"  → tense: ["past"]
 *   tenseMarking: "future" → tense: ["fut"]
 *   tenseMarking: "both"  → tense: ["past", "fut"]
 *   tenseMarking: "none"  → tense: []
 *   aspectSystem: "simple"   → aspect: []
 *   aspectSystem: "pfv-ipfv" → aspect: ["pfv", "ipfv"]
 *   aspectSystem: "prog"     → aspect: ["prog"]
 *   aspectSystem: "rich"     → aspect: ["pfv", "ipfv", "prog", "hab"]
 *
 * Phase 1 ships this as an opt-in helper; callers choose when to
 * apply it. Phase 4+ may invoke it at language construction to
 * apply the gate universally (with snapshot regen).
 */
export function deriveGrammaticalisedAxes(
  grammar: GrammarFeatures,
): GrammaticalisedAxes {
  const out: GrammaticalisedAxes = {};
  switch (grammar.tenseMarking) {
    case "past":   out.tense = ["past"]; break;
    case "future": out.tense = ["fut"]; break;
    case "both":   out.tense = ["past", "fut"]; break;
    case "none":   out.tense = []; break;
  }
  switch (grammar.aspectSystem) {
    case "simple":   out.aspect = []; break;
    case "pfv-ipfv": out.aspect = ["pfv", "ipfv"]; break;
    case "prog":     out.aspect = ["prog"]; break;
    case "rich":     out.aspect = ["pfv", "ipfv", "prog", "hab"]; break;
  }
  switch (grammar.moodMarking) {
    case "declarative": out.mood = []; break;
    case "subjunctive": out.mood = ["subj"]; break;
    case "imperative":  out.mood = ["imp"]; break;
  }
  switch (grammar.voice) {
    case "active": out.voice = []; break;
    case "mixed":  out.voice = ["pass"]; break;
  }
  switch (grammar.evidentialMarking) {
    case "none":        out.evidentiality = []; break;
    case "direct-only": out.evidentiality = ["dir"]; break;
    case "three-way":   out.evidentiality = ["dir", "rep", "inf"]; break;
  }
  // Case axis is derived jointly from `hasCase` + `alignment`. A
  // language with `hasCase: false` and `caseStrategy: preposition`
  // grammaticalises no morphological cases; an erg-abs language
  // exposes `erg` + `abs` instead of `nom` + `acc`.
  if (grammar.hasCase === false) {
    out.case = [];
  } else {
    switch (grammar.alignment) {
      case "nom-acc":    out.case = ["nom", "acc", "gen", "dat", "loc", "inst", "abl"]; break;
      case "erg-abs":    out.case = ["erg", "abs", "gen", "dat", "loc", "inst", "abl"]; break;
      case "tripartite": out.case = ["nom", "acc", "erg", "gen", "dat", "loc", "inst", "abl"]; break;
      case "split-S":    out.case = ["nom", "acc", "erg", "abs", "gen", "dat", "loc", "inst", "abl"]; break;
    }
  }
  return out;
}
