import type { Language, SoundChange } from "../types";
import type { Phoneme, WordForm } from "../primitives";
import type { FeatureQuery } from "./features";
import { featuresOf, matchesQuery, isIntervocalic } from "./features";
import { isVowel } from "./ipa";
import type { Rng } from "../rng";
import type { RuleFamily, RuleContext, GeneratedRule } from "./generated-types";

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

const EMPTY_SITES: readonly number[] = [];

export function matchSites(rule: GeneratedRule, word: WordForm): number[] {
  let out: number[] | null = null;
  for (let i = 0; i < word.length; i++) {
    const p = word[i]!;
    if (!(p in rule.outputMap)) continue;
    if (!matchesQuery(p, rule.from)) continue;
    if (!contextMatches(rule, word, i)) continue;
    if (out === null) out = [];
    out.push(i);
  }
  return out ?? (EMPTY_SITES as number[]);
}

export function hasMatch(rule: GeneratedRule, word: WordForm): boolean {
  for (let i = 0; i < word.length; i++) {
    const p = word[i]!;
    if (!(p in rule.outputMap)) continue;
    if (!matchesQuery(p, rule.from)) continue;
    if (!contextMatches(rule, word, i)) continue;
    return true;
  }
  return false;
}

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

export function hasAnyMatch(rule: GeneratedRule, lang: Language): boolean {
  for (const m of Object.keys(lang.lexicon)) {
    if (hasMatch(rule, lang.lexicon[m]!)) return true;
  }
  return false;
}

export function countAffectedForms(rule: GeneratedRule, lang: Language): number {
  let n = 0;
  for (const m of Object.keys(lang.lexicon)) {
    if (hasMatch(rule, lang.lexicon[m]!)) n++;
  }
  return n;
}

export function hasVowel(word: WordForm): boolean {
  return word.some((p) => isVowel(p));
}

export function inventoryHas(lang: Language, phones: Phoneme[]): boolean {
  const inv = new Set(lang.phonemeInventory.segmental);
  return phones.every((p) => inv.has(p));
}

export function phonemesMatching(lang: Language, q: FeatureQuery): Phoneme[] {
  return lang.phonemeInventory.segmental.filter((p) => {
    const f = featuresOf(p);
    return f !== undefined && matchesQuery(p, q);
  });
}
