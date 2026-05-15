import type { Language, GrammarFeatures } from "../types";
import type { Rng } from "../rng";
import { proposeOneRule } from "../phonology/propose";
import { pickNextStressForSplit } from "../grammar/stressTransitions";
import { setGrammarFeature } from "../grammar/mutate";

/**
 * founder.ts
 *
 * Phylogenetic split mechanics, leafIds, founder selection, MSA-based proto reconstruction. Key exports: FounderInnovation, applyFounderInnovation.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

type GrammarFlip = {
  feature: keyof GrammarFeatures;
  from: GrammarFeatures[keyof GrammarFeatures];
  to: GrammarFeatures[keyof GrammarFeatures];
};

// Phase 71d (G3): mirror of `WORD_ORDER_FLIP_COOLDOWN` from
// grammar/evolve.ts. Founder innovation honours the same cooldown the
// drift step does — without this gate, a natural split's
// applyFounderInnovation could flip word order even on a lineage
// that Historical Mode has locked via lockWordOrderUntilGen.
const WORD_ORDER_LOCK_BUFFER = 50;

function isWordOrderLocked(lang: Language, generation: number): boolean {
  const lastFlip = lang.wordOrderLastFlipGen;
  if (lastFlip === undefined) return false;
  return generation - lastFlip < WORD_ORDER_LOCK_BUFFER;
}

function flipGrammar(
  child: Language,
  rng: Rng,
  generation: number,
): GrammarFlip | null {
  const g = child.grammar;
  const options: GrammarFlip[] = [];
  if (g.pluralMarking !== "affix") options.push({ feature: "pluralMarking", from: g.pluralMarking, to: "affix" });
  if (g.pluralMarking !== "reduplication") options.push({ feature: "pluralMarking", from: g.pluralMarking, to: "reduplication" });
  if (g.tenseMarking !== "past") options.push({ feature: "tenseMarking", from: g.tenseMarking, to: "past" });
  if (g.tenseMarking !== "both") options.push({ feature: "tenseMarking", from: g.tenseMarking, to: "both" });
  if (!g.hasCase) options.push({ feature: "hasCase", from: false, to: true });
  else options.push({ feature: "hasCase", from: true, to: false });
  if (g.affixPosition === "suffix") options.push({ feature: "affixPosition", from: "suffix", to: "prefix" });
  else options.push({ feature: "affixPosition", from: "prefix", to: "suffix" });
  // Phase 71d: only propose word-order flips when the lineage's
  // cooldown isn't active. Honours both organic post-flip cooldowns
  // and Historical Mode's `lockWordOrderUntilGen` future-dated locks.
  if (!isWordOrderLocked(child, generation)) {
    if (g.wordOrder === "SVO") options.push({ feature: "wordOrder", from: "SVO", to: "SOV" });
    else if (g.wordOrder === "SOV") options.push({ feature: "wordOrder", from: "SOV", to: "VSO" });
    else if (g.wordOrder === "VSO") options.push({ feature: "wordOrder", from: "VSO", to: "SVO" });
  }
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
      // Phase 73d D3: weight the stress target by the daughter's
      // typologicalDirection.synthesis (positive → fixed-stress,
      // negative → free-stress patterns).
      const next = pickNextStressForSplit(current, rng, child.typologicalDirection);
      if (next !== current) {
        child.stressPattern = next;
        descriptions.push(`stress pattern: ${current} → ${next}`);
        primaryKind ??= kind;
      }
    } else if (kind === "grammar") {
      // Phase 39l: multiple grammar flips per founder event.
      const seenFeatures = new Set<string>();
      for (let i = 0; i < maxGrammarFlips; i++) {
        const flip = flipGrammar(child, rng, generation);
        if (!flip || seenFeatures.has(flip.feature)) continue;
        seenFeatures.add(flip.feature);
        setGrammarFeature(child.grammar, flip.feature, flip.to as GrammarFeatures[typeof flip.feature]);
        // Phase 72a T5 (Contract C6 + Invariant 3 fix): record the
        // flip timestamp so subsequent drift / Historical Mode locks
        // see this as a "recent flip" and gate accordingly.
        // Pre-72a, founder flipped wordOrder via setGrammarFeature
        // without writing wordOrderLastFlipGen — the cooldown check
        // in maybeDriftWordOrder treated it as never-flipped. The
        // Phase 71d lock partially addressed this by reading the
        // post-patch lock value, but the underlying bug remained.
        if (flip.feature === "wordOrder") {
          child.wordOrderLastFlipGen = generation;
        }
        descriptions.push(`${flip.feature}: ${String(flip.from)} → ${String(flip.to)}`);
        primaryKind ??= kind;
      }
    }
  }

  // Phase 73d D3: extra-roll stress flip. The shuffled-category
  // loop above picks stress at most once and competes with
  // phonology/grammar; in practice founder events almost never
  // fire stress because phonology/grammar typically grab the
  // slot. D3 adds a separate 45% roll to flip stress AS WELL,
  // independently of the shuffled outcome. Direction-weighted
  // target via pickNextStressForSplit.
  const stressAlreadyFlipped = descriptions.some((d) => d.startsWith("stress pattern:"));
  if (!stressAlreadyFlipped && !forbidden?.has("stress") && rng.chance(0.45)) {
    const current = child.stressPattern ?? "penult";
    const next = pickNextStressForSplit(current, rng, child.typologicalDirection);
    if (next !== current) {
      child.stressPattern = next;
      descriptions.push(`stress pattern: ${current} → ${next}`);
      primaryKind ??= "stress";
    }
  }

  if (descriptions.length === 0) return null;
  return {
    kind: primaryKind ?? "grammar",
    description: descriptions.join("; "),
  };
}
