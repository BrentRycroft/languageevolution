import type { Language, Meaning, WordForm } from "../../types";
import type { Rng } from "../../rng";
import { derivationFor } from "../../lexicon/derivation_targets";
import { findSuffixByCategory, type DerivationalSuffix } from "../../lexicon/derivation";

/**
 * Targeted derivation: when the genesis loop is asked to coin a meaning M
 * AND M has a known derivation chain (M = root + suffix-of-category C)
 * AND the language has the root in its lexicon
 * AND the language has a suffix in category C,
 * compose root + suffix and return the new form. Records chain info on
 * the language's wordOriginChain so the UI can surface the etymology.
 *
 * Returns null when the chain doesn't apply, letting the genesis loop
 * fall through to its random mechanism cascade.
 *
 * Probability of selection (when applicable) is high — the linguistic
 * default is "use the productive morphology you have" rather than coining
 * an arbitrary new root.
 */
export interface TargetedDerivationResult {
  meaning: Meaning;
  form: WordForm;
  rootMeaning: Meaning;
  suffixTag: string;
}

export function attemptTargetedDerivation(
  lang: Language,
  meaning: Meaning,
  rng: Rng,
): TargetedDerivationResult | null {
  // Decline only deterministically — the caller sets the probability.
  void rng;

  const target = derivationFor(meaning);
  if (!target) return null;

  const root = lang.lexicon[target.root];
  if (!root || root.length === 0) return null;

  const suffix: DerivationalSuffix | null = findSuffixByCategory(lang, target.via);
  if (!suffix) return null;

  // Compose. Suffix attaches as a true suffix (after the root).
  const form: WordForm = [...root, ...suffix.affix];

  return {
    meaning,
    form,
    rootMeaning: target.root,
    suffixTag: suffix.tag,
  };
}

/**
 * Helper: record the derivation chain on the language's wordOriginChain.
 * Called by the genesis driver after a successful targeted derivation.
 */
export function recordDerivationChain(
  lang: Language,
  result: TargetedDerivationResult,
): void {
  if (!lang.wordOriginChain) lang.wordOriginChain = {};
  lang.wordOriginChain[result.meaning] = {
    tag: "derivation",
    from: result.rootMeaning,
    via: result.suffixTag,
  };
}

/**
 * Phase 34 Tranche 34b: opportunistic productive derivation. When a
 * derivational suffix has crossed PRODUCTIVITY_THRESHOLD, it should
 * be applicable to ANY semantically-compatible open-class root, not
 * just the meanings hard-coded in DERIVATION_TARGETS. Pre-Phase-34
 * "speaker" (= speak + -er) could only be coined if the user pre-
 * registered "speaker" in the targets table. Now once -er is
 * productive, the genesis loop can coin "speaker", "writer",
 * "runner", etc. as ad-hoc derivations from any verb.
 *
 * Picks a productive suffix, picks a compatible root, and synthesises
 * a new meaning name `${root}-${suffix.tag}`. Returns null if no
 * productive suffix exists, no compatible root, or the meaning
 * already exists in the lexicon.
 */
export function attemptProductiveDerivation(
  lang: Language,
  rng: Rng,
): TargetedDerivationResult | null {
  const suffixes = (lang.derivationalSuffixes ?? []).filter((s) => s.productive);
  if (suffixes.length === 0) return null;

  // Pick a random productive suffix.
  const suffix = suffixes[rng.int(suffixes.length)]!;

  // Filter potential roots by suffix category. agentive/nominalisation
  // wants verb roots; adjectival wants noun roots; abstractNoun wants
  // adjective roots (freedom < free); etc.
  const allMeanings = Object.keys(lang.lexicon);
  const wantsVerb = suffix.category === "agentive" || suffix.category === "nominalisation";
  const wantsAdj = suffix.category === "abstractNoun";
  const wantsNoun =
    suffix.category === "diminutive" ||
    suffix.category === "adjectival" ||
    suffix.category === "denominal" ||
    suffix.category === "dominionAbstract";

  const candidates: string[] = [];
  for (const m of allMeanings) {
    // Skip if already derived (avoid recursive -er-er pyramids).
    if (m.includes("-")) continue;
    // Skip if the derived meaning would already exist.
    if (lang.lexicon[`${m}-${suffix.tag}`]) continue;
    // Skip closed-class.
    if (m.length <= 1) continue;
    // POS-match heuristic by simple word lists. The simulator's
    // posOf is in lexicon/pos.ts but importing here would create a
    // cycle; the heuristic below is good enough for the productive
    // path.
    const looksVerb = ["go", "see", "eat", "drink", "speak", "make", "take", "give", "run", "walk", "sleep", "write", "read", "fight", "kill", "build", "find", "lose", "throw", "catch", "hold", "carry", "bring", "send"].includes(m);
    const looksAdj = ["big", "small", "good", "bad", "new", "old", "long", "short", "hot", "cold", "wet", "dry", "young", "happy", "sad", "free", "kind", "wise"].includes(m);
    const looksNoun = !looksVerb && !looksAdj;
    if (wantsVerb && !looksVerb) continue;
    if (wantsAdj && !looksAdj) continue;
    if (wantsNoun && !looksNoun) continue;
    candidates.push(m);
  }
  if (candidates.length === 0) return null;
  const rootMeaning = candidates[rng.int(candidates.length)]!;
  const root = lang.lexicon[rootMeaning]!;
  const form: WordForm = [...root, ...suffix.affix];
  // Phase 34 Tranche 34b: tag is sometimes "-hood" (leading dash);
  // strip it so the meaning is "dry-hood" not "dry--hood".
  const tagSlug = suffix.tag.replace(/^-+/, "");
  const newMeaning = `${rootMeaning}-${tagSlug}`;
  return {
    meaning: newMeaning,
    form,
    rootMeaning,
    suffixTag: suffix.tag,
  };
}
