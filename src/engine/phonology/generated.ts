import type { Language, SoundChange } from "../types";
import type { Phoneme, WordForm } from "../primitives";
import type { FeatureQuery } from "./features";
import { featuresOf, matchesQuery, isIntervocalic } from "./features";
import { isVowel } from "./ipa";
import type { Rng } from "../rng";
import type { RuleFamily, RuleContext, GeneratedRule } from "./generated-types";

// Re-export for backwards compatibility — many call sites already
// import these from `phonology/generated`.
export type { RuleFamily, RuleContext, GeneratedRule };

function neighbourMatches(
  query: FeatureQuery | "#" | "any" | undefined,
  phoneme: Phoneme | undefined,
): boolean {
  if (query === undefined || query === "any") return true;
  if (query === "#") return phoneme === undefined;
  if (phoneme === undefined) return false;
  return matchesQuery(phoneme, query);
}

/**
 * Does the context hold at `index` in `word`?
 */
export function contextMatches(
  rule: GeneratedRule,
  word: WordForm,
  index: number,
): boolean {
  const left = word[index - 1];
  const right = word[index + 1];

  if (rule.context.locus === "intervocalic" && !isIntervocalic(left, right)) {
    return false;
  }
  if (rule.context.locus === "edge" && left !== undefined && right !== undefined) {
    return false;
  }
  if (rule.context.position === "initial" && index !== 0) return false;
  if (rule.context.position === "final" && index !== word.length - 1) return false;
  if (
    rule.context.position === "medial" &&
    (index === 0 || index === word.length - 1)
  ) {
    return false;
  }
  if (!neighbourMatches(rule.context.before, left)) return false;
  if (!neighbourMatches(rule.context.after, right)) return false;
  return true;
}

/**
 * Enumerate indices in `word` where the rule could fire.
 */
export function matchSites(rule: GeneratedRule, word: WordForm): number[] {
  const out: number[] = [];
  for (let i = 0; i < word.length; i++) {
    const p = word[i]!;
    if (!(p in rule.outputMap)) continue;
    if (!matchesQuery(p, rule.from)) continue;
    if (!contextMatches(rule, word, i)) continue;
    out.push(i);
  }
  return out;
}

/**
 * Apply a generated rule to a word. Each matching site flips a coin based on
 * the rule's strength. Returns the original array (by reference) if nothing
 * changed, so callers can detect no-op easily. Empty-string outputs delete
 * the segment; the result is compacted.
 *
 * Deletion sites are refused when firing them would leave the word
 * either empty OR in a phonotactically illegal shape — specifically, a
 * single lone consonant (e.g. /r/, /k/). A single lone vowel (/a/, /i/)
 * is permitted since syllabic-nucleus-only words are attested (cf.
 * French "a", "y"; English "a", "I"). The practical effect: cascading
 * deletion rules no longer collapse distinct short words like "water",
 * "beer", "before" all into /r/.
 */
export function applyGeneratedRule(
  rule: GeneratedRule,
  word: WordForm,
  rng: Rng,
): WordForm {
  const sites = matchSites(rule, word);
  if (sites.length === 0) return word;
  let changed = false;
  const out: (string | null)[] = word.slice();
  for (const i of sites) {
    if (!rng.chance(rule.strength)) continue;
    const from = word[i]!;
    const to = rule.outputMap[from];
    if (to === undefined || to === from) continue;
    if (to === "" && !deletionIsLegal(out, i)) continue;
    changed = true;
    out[i] = to === "" ? null : to;
  }
  if (!changed) return word;
  return out.filter((p): p is string => p !== null && p.length > 0);
}

/**
 * True when deleting `out[i]` would leave at least one phoneme remaining,
 * and if it leaves exactly one, that phoneme is a vowel. Called with
 * `out` in its in-progress (pre-compact) state; `null` entries mean
 * previous sites in this same rule-firing already deleted them.
 */
function deletionIsLegal(out: (string | null)[], i: number): boolean {
  let vowelSurvivors = 0;
  let consonantSurvivors = 0;
  for (let j = 0; j < out.length; j++) {
    if (j === i) continue;
    const p = out[j];
    if (p == null) continue;
    if (isVowel(p)) vowelSurvivors++;
    else consonantSurvivors++;
  }
  if (vowelSurvivors + consonantSurvivors === 0) return false;
  if (vowelSurvivors === 0 && consonantSurvivors === 1) return false;
  return true;
}

/**
 * Adapt a GeneratedRule to the SoundChange contract so the existing
 * applyChangesToLexicon pipeline handles it without modification.
 */
export function generatedToSoundChange(rule: GeneratedRule): SoundChange {
  return {
    id: rule.id,
    label: rule.description,
    category: familyToCategory(rule.family),
    description: rule.description,
    enabledByDefault: true,
    baseWeight: 1,
    probabilityFor: (word) => {
      const sites = matchSites(rule, word);
      if (sites.length === 0) return 0;
      // Saturate quickly: one site ≈ 0.4 prob, two ≈ 0.6, three+ ≈ 0.75.
      return Math.min(0.8, 0.25 + 0.15 * sites.length);
    },
    apply: (word, rng) => applyGeneratedRule(rule, word, rng),
  };
}

function familyToCategory(family: RuleFamily): SoundChange["category"] {
  switch (family) {
    case "lenition":
      return "lenition";
    case "fortition":
      return "fortition";
    case "place_assim":
      return "assimilation";
    case "palatalization":
      return "palatalization";
    case "vowel_shift":
    case "vowel_reduction":
      return "vowel";
    case "harmony":
      return "assimilation";
    case "deletion":
      return "deletion";
    case "metathesis":
      return "metathesis";
    case "tone":
      return "voicing";
  }
}

/**
 * Does the rule have ≥ 1 matching site in the language's current lexicon?
 * Used to validate a freshly-proposed rule and to decide when it retires.
 */
export function hasAnyMatch(rule: GeneratedRule, lang: Language): boolean {
  for (const m of Object.keys(lang.lexicon)) {
    const w = lang.lexicon[m]!;
    if (matchSites(rule, w).length > 0) return true;
  }
  return false;
}

/**
 * Count how many distinct forms would change if this rule fired at full
 * strength. Used by the proposer to reject "lexicon-killing" proposals.
 */
export function countAffectedForms(rule: GeneratedRule, lang: Language): number {
  let n = 0;
  for (const m of Object.keys(lang.lexicon)) {
    if (matchSites(rule, lang.lexicon[m]!).length > 0) n++;
  }
  return n;
}

/** Convenience: does this word contain a vowel? Used by several templates. */
export function hasVowel(word: WordForm): boolean {
  return word.some((p) => isVowel(p));
}

/** Convenience: is the given set of phonemes a subset of the inventory? */
export function inventoryHas(lang: Language, phones: Phoneme[]): boolean {
  const inv = new Set(lang.phonemeInventory.segmental);
  return phones.every((p) => inv.has(p));
}

/** Convenience: find all phonemes in the language that satisfy a query. */
export function phonemesMatching(lang: Language, q: FeatureQuery): Phoneme[] {
  return lang.phonemeInventory.segmental.filter((p) => {
    const f = featuresOf(p);
    return f !== undefined && matchesQuery(p, q);
  });
}
