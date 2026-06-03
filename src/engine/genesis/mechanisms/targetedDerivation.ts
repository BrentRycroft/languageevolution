import type { Language, Meaning, WordForm } from "../../types";
import type { Rng } from "../../rng";
import { derivationFor } from "../../lexicon/derivation_targets";
import { findSuffixByCategory, type DerivationalSuffix } from "../../lexicon/derivation";
import { lexGet, lexHas, lexKeys } from "../../lexicon/access";
import { recordedParts } from "../../lexicon/word";
import { posOf } from "../../lexicon/pos";
import type { DerivationCategory } from "../../lexicon/derivation";

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

  const root = lexGet(lang, target.root);
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
  // Phase 5a: exclude suffixes with no category from the productive path.
  // Bantu noun-class prefixes (ku-/mu-/ka-) get stored as derivationalSuffixes
  // with `category===undefined` + productive; with no category they match no
  // root-POS filter below and so were smeared onto conjunctions/adjectives.
  // A categoryless affix has no well-defined derivation semantics — skip it.
  const suffixes = (lang.derivationalSuffixes ?? []).filter(
    (s) => s.productive && (s as { category?: DerivationCategory }).category !== undefined,
  );
  if (suffixes.length === 0) return null;

  // Pick a random productive suffix.
  const suffix = suffixes[rng.int(suffixes.length)]!;

  // Filter potential roots by suffix category. agentive/nominalisation
  // wants verb roots; adjectival wants noun roots; abstractNoun wants
  // adjective roots (freedom < free); etc.
  const allMeanings = lexKeys(lang);
  const wantsVerb = suffix.category === "agentive" || suffix.category === "nominalisation";
  const wantsAdj = suffix.category === "abstractNoun";
  const wantsNoun =
    suffix.category === "diminutive" ||
    suffix.category === "adjectival" ||
    suffix.category === "denominal" ||
    suffix.category === "dominionAbstract";

  const candidates: string[] = [];
  for (const m of allMeanings) {
    // Skip if already structured (avoid recursive -er-er pyramids).
    // Concept-native (item 4): read the language's own compound/derivation
    // record (covers coinage since genesis records it) rather than guessing
    // from a hyphen in the English gloss. Bound morphemes (affix keys like
    // `-er.agt`, runtime `-xy.reanalysed`) carry no compound record, so keep
    // excluding them explicitly — the old `m.includes("-")` did so via the dash.
    if (recordedParts(lang, m) !== null || lang.boundMorphemes?.has(m)) continue;
    // Skip if the derived meaning would already exist.
    if (lexHas(lang, `${m}-${suffix.tag}`)) continue;
    // Skip closed-class.
    if (m.length <= 1) continue;
    // Phase 5a: POS-match via the engine's own `posOf`, not a hardcoded
    // English wordlist. (pos.ts imports only the Meaning type — a leaf module
    // — so there is no import cycle; the old comment's cycle fear was unfounded.)
    // This de-anglicises root eligibility: any preset's roots are classified by
    // the same concept-registry POS the rest of the engine uses.
    const pos = posOf(m);
    if (wantsVerb && pos !== "verb") continue;
    if (wantsAdj && pos !== "adjective") continue;
    if (wantsNoun && pos !== "noun") continue;
    candidates.push(m);
  }
  if (candidates.length === 0) return null;
  const rootMeaning = candidates[rng.int(candidates.length)]!;
  const root = lexGet(lang, rootMeaning)!;
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
