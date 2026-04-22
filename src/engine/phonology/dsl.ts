import type { Phoneme, SoundChange, WordForm } from "../types";
import { isVowel, isConsonant } from "./ipa";

/**
 * Tiny sound-change DSL:
 *   "p -> f"              unconditional substitution
 *   "k -> h / _V"         k → h before a vowel
 *   "s -> z / V_V"        intervocalic voicing
 *   "V -> # / _#"         final vowel deletion (# on RHS means delete)
 *   "t -> tʃ / _i"        before a specific phoneme
 *
 * Metachars:
 *   V  — any vowel
 *   C  — any consonant
 *   _  — the target position
 *   #  — word boundary (or, on RHS, deletion)
 *
 * Probability is applied at per-site granularity with a fixed base of 0.08
 * per site, unless an overriding weight is attached via the catalog entry.
 */

export interface ParsedRule {
  id: string;
  label: string;
  from: Phoneme;
  to: Phoneme | null; // null = delete
  before?: "V" | "C" | "#" | Phoneme | null;
  after?: "V" | "C" | "#" | Phoneme | null;
}

const ARROW_RE = /^([^\s]+)\s*(?:->|→)\s*([^\s/]+)(?:\s*\/\s*(.+))?$/;

export function parseRuleDsl(text: string): ParsedRule | string {
  const trimmed = text.trim();
  if (!trimmed) return "rule is empty";
  const m = trimmed.match(ARROW_RE);
  if (!m) return 'expected syntax "p -> f" or "p -> f / _V"';
  const from = m[1]!;
  const to = m[2] === "#" || m[2] === "∅" ? null : m[2]!;
  const ctx = m[3];
  let before: ParsedRule["before"] = null;
  let after: ParsedRule["after"] = null;
  if (ctx) {
    const idx = ctx.indexOf("_");
    if (idx === -1) return 'context must contain "_"';
    before = ctx.slice(0, idx).trim() || null;
    after = ctx.slice(idx + 1).trim() || null;
  }
  const id = `user.${from}_to_${to ?? "null"}${before ?? ""}${after ?? ""}`;
  const label = ctx ? `${from} → ${to ?? "∅"} / ${ctx}` : `${from} → ${to ?? "∅"}`;
  return { id, label, from, to, before: before as ParsedRule["before"], after: after as ParsedRule["after"] };
}

function matchesContext(
  word: WordForm,
  i: number,
  ctx: ParsedRule["before"] | ParsedRule["after"],
  which: "before" | "after",
): boolean {
  if (!ctx) return true;
  // Word boundary check
  if (ctx === "#") return which === "before" ? i === 0 : i === word.length - 1;
  // For neighbour, inspect the adjacent phoneme.
  const neighbourIdx = which === "before" ? i - 1 : i + 1;
  if (neighbourIdx < 0 || neighbourIdx >= word.length) return false;
  const neighbour = word[neighbourIdx]!;
  if (ctx === "V") return isVowel(neighbour);
  if (ctx === "C") return isConsonant(neighbour);
  return neighbour === ctx;
}

function matchesFrom(segment: Phoneme, from: Phoneme): boolean {
  if (from === "V") return isVowel(segment);
  if (from === "C") return isConsonant(segment);
  return segment === from;
}

function matchesAt(word: WordForm, i: number, rule: ParsedRule): boolean {
  if (!matchesFrom(word[i]!, rule.from)) return false;
  if (!matchesContext(word, i, rule.before, "before")) return false;
  if (!matchesContext(word, i, rule.after, "after")) return false;
  return true;
}

function countSites(word: WordForm, rule: ParsedRule): number {
  let n = 0;
  for (let i = 0; i < word.length; i++) if (matchesAt(word, i, rule)) n++;
  return n;
}

/**
 * Compile a parsed user rule into a SoundChange the engine can run alongside
 * the catalog rules. `userWeight` multiplies the per-site base probability.
 */
export function compileUserRule(rule: ParsedRule, userWeight = 1): SoundChange {
  const perSite = 0.08 * userWeight;
  return {
    id: rule.id,
    label: rule.label,
    category: rule.to === null ? "deletion" : "lenition",
    description: "User-defined rule",
    probabilityFor: (w) => 1 - Math.pow(1 - perSite, countSites(w, rule)),
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length; i++) if (matchesAt(word, i, rule)) sites.push(i);
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      if (rule.to === null) {
        out.splice(idx, 1);
      } else {
        out[idx] = rule.to;
      }
      return out;
    },
    enabledByDefault: true,
    baseWeight: 1,
  };
}
