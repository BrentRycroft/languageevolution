import type { Language, GrammarFeatures } from "../types";
import type { Rng } from "../rng";
import { proposeOneRule } from "../phonology/propose";
import { pickNextStressForSplit } from "../grammar/stressTransitions";
import { setGrammarFeature } from "../grammar/mutate";

type GrammarFlip = {
  feature: keyof GrammarFeatures;
  from: GrammarFeatures[keyof GrammarFeatures];
  to: GrammarFeatures[keyof GrammarFeatures];
};

function flipGrammar(g: GrammarFeatures, rng: Rng): GrammarFlip | null {
  const options: GrammarFlip[] = [];
  if (g.pluralMarking !== "affix") options.push({ feature: "pluralMarking", from: g.pluralMarking, to: "affix" });
  if (g.pluralMarking !== "reduplication") options.push({ feature: "pluralMarking", from: g.pluralMarking, to: "reduplication" });
  if (g.tenseMarking !== "past") options.push({ feature: "tenseMarking", from: g.tenseMarking, to: "past" });
  if (g.tenseMarking !== "both") options.push({ feature: "tenseMarking", from: g.tenseMarking, to: "both" });
  if (!g.hasCase) options.push({ feature: "hasCase", from: false, to: true });
  else options.push({ feature: "hasCase", from: true, to: false });
  if (g.affixPosition === "suffix") options.push({ feature: "affixPosition", from: "suffix", to: "prefix" });
  else options.push({ feature: "affixPosition", from: "prefix", to: "suffix" });
  if (g.wordOrder === "SVO") options.push({ feature: "wordOrder", from: "SVO", to: "SOV" });
  else if (g.wordOrder === "SOV") options.push({ feature: "wordOrder", from: "SOV", to: "VSO" });
  else if (g.wordOrder === "VSO") options.push({ feature: "wordOrder", from: "VSO", to: "SVO" });
  if (options.length === 0) return null;
  return options[rng.int(options.length)]!;
}

export interface FounderInnovation {
  kind: "phonology" | "stress" | "grammar";
  description: string;
}

export function applyFounderInnovation(
  child: Language,
  rng: Rng,
  generation: number,
  forbidden?: ReadonlySet<string>,
): FounderInnovation | null {
  if (rng.chance(0.3)) return null;

  const order: Array<"phonology" | "stress" | "grammar"> = (() => {
    const arr: Array<"phonology" | "stress" | "grammar"> = ["phonology", "stress", "grammar"];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = t;
    }
    return arr;
  })();

  // Phase 39l: multi-flip founder. Pre-39l this returned after the
  // FIRST successful innovation (one category per founder event,
  // one grammar flip per category). That's too conservative — Old
  // → Middle English shock changed phonology, stress, AND multiple
  // grammar features simultaneously. Allow up to 3 grammar flips
  // per event (weighted by tier so high-tier shocks flip more) plus
  // each non-grammar category at most once.
  const tier = (child.culturalTier ?? 0) as number;
  const maxGrammarFlips = 1 + Math.min(3, Math.floor(tier * 0.7 + rng.next() * 1.5));
  const descriptions: string[] = [];
  let primaryKind: "phonology" | "stress" | "grammar" | null = null;

  for (const kind of order) {
    if (forbidden?.has(kind)) continue;
    if (kind === "phonology") {
      const rule = proposeOneRule(child, rng, generation);
      if (rule) {
        if (!child.activeRules) child.activeRules = [];
        child.activeRules.push(rule);
        descriptions.push(`phonological innovation: ${rule.description}`);
        primaryKind ??= kind;
      }
    } else if (kind === "stress") {
      const current = child.stressPattern ?? "penult";
      const next = pickNextStressForSplit(current, rng);
      if (next !== current) {
        child.stressPattern = next;
        descriptions.push(`stress pattern: ${current} → ${next}`);
        primaryKind ??= kind;
      }
    } else if (kind === "grammar") {
      // Phase 39l: multiple grammar flips per founder event.
      const seenFeatures = new Set<string>();
      for (let i = 0; i < maxGrammarFlips; i++) {
        const flip = flipGrammar(child.grammar, rng);
        if (!flip || seenFeatures.has(flip.feature)) continue;
        seenFeatures.add(flip.feature);
        setGrammarFeature(child.grammar, flip.feature, flip.to as GrammarFeatures[typeof flip.feature]);
        descriptions.push(`${flip.feature}: ${String(flip.from)} → ${String(flip.to)}`);
        primaryKind ??= kind;
      }
    }
  }

  if (descriptions.length === 0) return null;
  return {
    kind: primaryKind ?? "grammar",
    description: descriptions.join("; "),
  };
}
